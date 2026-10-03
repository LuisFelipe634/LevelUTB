#!/usr/bin/env bash
# =======================================================
# setup.sh - Instalacion automatica de LevelUTB (sin intervencion manual)
#
# Modo por defecto: Docker (unico metodo soportado en
# Windows, macOS y Linux segun README). No instala
# Node.js ni PostgreSQL en el host.
#
# Uso:
#   ./setup.sh [opciones]
#
# Opciones:
#   -y, --yes       No pedir confirmacion (CI / automatico).
#       --no-build  No reconstruir imagenes (solo `up -d`).
#       --reset     Borra volumen pgdata (down -v) antes de levantar. Destructivo.
#       --reseed    Ejecuta seed destructivo al final (db:seed). Destructivo.
#       --local     Instalacion nativa sin Docker (Node + PostgreSQL del host).
#                   Util en Linux/macOS o CI sin Docker. En Windows no soportado.
#       --skip-db   (Solo --local) omite PostgreSQL, db:push y db:seed.
#                   Por compatibilidad, usarlo sin --local activa modo --local.
#   -h, --help      Muestra esta ayuda.
#
# Ejemplos:
#   ./setup.sh                 # Instalacion Docker completa, automatica
#   ./setup.sh --yes --reset   # Reinstalacion limpia sin preguntar
#   ./setup.sh --local         # Instalacion nativa (legacy, automatica)
# =======================================================
set -euo pipefail

# ---------- Colores ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
SEP="=============================="

info()  { local msg="$*"; echo -e "${GREEN}[setup]${NC} $msg"; }
warn()  { local msg="$*"; echo -e "${YELLOW}[setup]${NC} $msg"; }
error() { local msg="$*"; echo -e "${RED}[setup]${NC} $msg" >&2; }
die()   { local msg="$*"; error "$msg"; exit 1; }

# ---------- Flags ----------
ASSUME_YES=false
NO_BUILD=false
RESET=false
RESEED=false
LOCAL_MODE=false
SKIP_DB=false

usage() {
  local script="$0"
  awk '/^set -euo/{exit} NR>1 {sub(/^# ?/, ""); print}' "$script"
}

for arg in "$@"; do
  case "$arg" in
    -y|--yes)      ASSUME_YES=true ;;
    --no-build)    NO_BUILD=true ;;
    --reset)       RESET=true ;;
    --reseed)      RESEED=true ;;
    --local)       LOCAL_MODE=true ;;
    --skip-db)     SKIP_DB=true; LOCAL_MODE=true ;;
    -h|--help)     usage; exit 0 ;;
    *) die "Flag desconocida: $arg (usa --help)" ;;
  esac
done

confirm_destructive() {
  local label="$1"
  if [[ "$ASSUME_YES" == "true" ]]; then
    warn "Auto-confirmado: $label (--yes)."
    return 0
  fi
  echo -e "${YELLOW}[setup]${NC} $label [s/N]: " >&2
  local ans=""
  IFS= read -r ans < /dev/tty || ans=""
  case "$ans" in
    s|S|y|Y|si|yes) return 0 ;;
    *) die "Cancelado por el usuario." ;;
  esac
}

# ---------- Deteccion de SO (informativa; Docker funciona en todos) ----------
detect_os() {
  case "${OSTYPE:-}" in
    msys*|msys|mingw*|cygwin*) echo "windows"; return ;;
    *) ;; # Otro terminal: sigue con las demas detecciones.
  esac
  if [[ -f /proc/version ]] && grep -qi microsoft /proc/version 2>/dev/null; then
    echo "wsl"; return
  fi
  if [[ "${OSTYPE:-}" == "darwin"* ]]; then
    echo "macos"; return
  fi
  if [[ -f /etc/os-release ]]; then
    # shellcheck disable=SC1091
    . /etc/os-release
    case "${ID:-}" in
      ubuntu|debian|linuxmint|raspbian) echo "debian"; return ;;
      fedora|rhel|centos|rocky|alma*)   echo "fedora"; return ;;
      arch|manjaro|endeavouros)         echo "arch"; return ;;
      *) ;; # Distro no listada: sigue a la deteccion por uname.
    esac
  fi
  uname -s 2>/dev/null | grep -qi "mingw\|msys\|windows" && { echo "windows"; return; }
  echo "unknown"
}

OS=$(detect_os)
info "Sistema detectado: $OS"

# El script debe correr desde la raiz del repo (donde esta docker-compose.yml).
[[ -f docker-compose.yml ]] || die "Ejecuta ./setup.sh desde la raiz del proyecto (falta docker-compose.yml)."
[[ -f .env.example ]] || die "Falta .env.example en la raiz del proyecto."

command_exists() { local cmd="$1"; command -v "$cmd" >/dev/null 2>&1; }

# ---------- Secretos ----------
gen_secret() {
  if command_exists openssl; then
    openssl rand -hex 32 2>/dev/null && return 0
  fi
  if command_exists python3; then
    python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null && return 0
  fi
  if command_exists node; then
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null && return 0
  fi
  od -An -tx1 -N32 /dev/urandom 2>/dev/null | tr -d ' \n' && echo && return 0
  return 1
}

# Reemplazo portable GNU/BSD sed. Solo para valores hex simples.
set_env_key() {
  local key="$1" value="$2" file="${3:-.env}"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i.bak "s|^${key}=.*|${key}=\"${value}\"|" "$file"
    rm -f "${file}.bak"
  else
    printf '%s="%s"\n' "$key" "$value" >> "$file"
  fi
}

get_env_key() {
  local key="$1" file="${2:-.env}"
  grep "^${key}=" "$file" 2>/dev/null | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'"
}

pgdata_volume_exists() {
  docker volume ls --format '{{.Name}}' 2>/dev/null | grep -q "pgdata" || return 1
}

# Descargas remotas siempre sobre HTTPS (incluyendo redirects):
# sin --proto-redir, un `curl -L` podria seguir un redirect a http:// plano
# y ejecutar codigo no cifrado. Solo para URLs remotas; el health-check
# a localhost usa http:// a proposito (trafico local, sin TLS).
curl_https() {
  local args=("$@")
  curl -fsSL --proto '=https' --proto-redir '=https' "${args[@]}"
}

# ---------- .env automatico ----------
# Idempotente: nunca sobrescribe un .env existente, solo rellena
# secretos placeholder para que el arranque no requiera edicion manual.
ensure_env_auto() {
  if [[ ! -f .env ]]; then
    info "Creando .env desde .env.example..."
    cp .env.example .env
  else
    info ".env ya existe. Verificando valores placeholder (sin sobrescribir tus datos)..."
  fi

  local changed=false
  local secret pgpass

  secret=$(get_env_key "NEXTAUTH_SECRET" .env)
  if [[ -z "$secret" || "$secret" == *"cambia-este-secreto"* || ${#secret} -lt 32 ]]; then
    info "Generando NEXTAUTH_SECRET aleatorio..."
    secret=$(gen_secret) || die "No se pudo generar NEXTAUTH_SECRET (instala openssl o python3)."
    set_env_key "NEXTAUTH_SECRET" "$secret" .env
    changed=true
  fi

  pgpass=$(get_env_key "POSTGRES_PASSWORD" .env)
  if [[ -z "$pgpass" || "$pgpass" == "pon-aqui-tu-clave-local" ]]; then
    if [[ "$LOCAL_MODE" == "false" ]] && pgdata_volume_exists; then
      # Rotar la clave con un volumen ya inicializado romperia la conexion:
      # PostgreSQL solo aplica POSTGRES_PASSWORD al crear el volumen vacio.
      warn "POSTGRES_PASSWORD es placeholder pero ya existe un volumen pgdata."
      warn "Se conserva el valor actual. Para regenerar usa: ./setup.sh --reset --yes"
    else
      info "Generando POSTGRES_PASSWORD aleatorio..."
      pgpass=$(gen_secret | cut -c1-24) || die "No se pudo generar POSTGRES_PASSWORD."
      set_env_key "POSTGRES_PASSWORD" "$pgpass" .env
      changed=true
    fi
  fi

  if [[ "$changed" == "true" ]]; then
    info ".env actualizado automaticamente (secretos generados)."
  else
    info ".env OK, sin cambios necesarios."
  fi

  # Carga .env para el resto del script (DATABASE_URL, POSTGRES_*).
  set -a; . ./.env; set +a
}

# =======================================================
# MODO DOCKER (por defecto)
# =======================================================
check_docker() {
  command_exists docker || die "Docker no encontrado. Instalalo desde https://www.docker.com/products/docker-desktop/ e intenta de nuevo."
  docker compose version >/dev/null 2>&1 || die "El plugin 'docker compose' no esta disponible. Actualiza Docker Desktop."
  docker info >/dev/null 2>&1 || die "El motor Docker no esta en ejecucion. Abre Docker Desktop y espera a que este listo."
  info "Docker OK: $(docker --version | head -n1)"
}

compose() { local args=("$@"); docker compose "${args[@]}"; }

wait_for_cmd() {
  local timeout_s="$1"; shift
  local cmd=("$@")
  local waited=0
  while (( waited < timeout_s )); do
    if "${cmd[@]}" >/dev/null 2>&1; then return 0; fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

wait_for_url() {
  local url="$1" timeout_s="$2"
  local waited=0
  # Seguro por diseno: solo health-checks a localhost (nunca sale de la
  # maquina), sin -L y con --max-redirs 0 (los redirects jamas se siguen),
  # y la respuesta se descarta (solo importa el exit code). HTTPS no aplica:
  # los contenedores de desarrollo sirven HTTP plano en loopback.
  while (( waited < timeout_s )); do
    if command_exists curl && curl -fsS --max-time 3 --max-redirs 0 "$url" >/dev/null 2>&1; then return 0; fi
    sleep 5
    waited=$((waited + 5))
  done
  return 1
}

main_docker() {
  info "$SEP"
  info "LevelUTB - Instalacion automatica (Docker)"
  info "$SEP"

  check_docker
  ensure_env_auto

  if [[ "$RESET" == "true" ]]; then
    confirm_destructive "Esto borra el volumen PostgreSQL y TODOS los datos locales."
    info "Eliminando entorno previo (down -v)..."
    compose down -v
  fi

  info "Levantando servicios (esto puede tardar varios minutos la primera vez)..."
  if [[ "$NO_BUILD" == "true" ]]; then
    compose up -d
  else
    compose up --build -d
  fi

  # El servicio app ya ejecuta `prisma db push && db:seed-if-empty && dev`
  # (ver docker-compose.yml). Aqui solo esperamos a que todo este saludable.
  info "Esperando PostgreSQL..."
  if wait_for_cmd 90 compose exec -T db pg_isready -U "${POSTGRES_USER:-postgres}"; then
    info "PostgreSQL listo."
  else
    warn "PostgreSQL no respondio a tiempo. Revisa con: docker compose logs db"
  fi

  info "Esperando API academica externa (puerto 3001)..."
  if wait_for_url "http://localhost:3001/health" 120; then
    info "API externa lista."
  else
    warn "La API externa no respondio a tiempo. Revisa con: docker compose logs external-academic-api"
  fi

  info "Esperando aplicacion (puerto 3000)..."
  if wait_for_url "http://localhost:3000/login" 180; then
    info "Aplicacion lista."
  else
    warn "La app no respondio a tiempo (es normal en primera build). Revisa con: docker compose logs --tail=50 app"
  fi

  if [[ "$RESEED" == "true" ]]; then
    confirm_destructive "El reseed destructivo (db:seed) reemplaza usuarios, misiones y recompensas."
    info "Ejecutando seed destructivo..."
    compose exec -T app npm run db:seed
  fi

  echo ""
  info "Estado de servicios:"
  compose ps || true
  echo ""
  info "$SEP"
  info "Instalacion completada."
  info "App:            http://localhost:3000"
  info "API academica:  http://localhost:3001/health"
  info "Credenciales:   demo@utb.edu.co / demo123 (docente@utb.edu.co / demo123)"
  info "Logs app:       docker compose logs --tail=50 app"
  info "Detener:        docker compose down   (conserva datos)"
  info "Reset total:    ./setup.sh --reset --yes"
  info "$SEP"
}

# =======================================================
# MODO LOCAL (legacy, sin Docker): Node + PostgreSQL del host
# Automatico y no interactivo. Solo Linux/macOS.
# =======================================================
APT_UPDATED=false

ensure_pkg() {
  local pkg="$1"
  case "$OS" in
    debian)
      if [[ "$APT_UPDATED" == "false" ]]; then
        sudo apt-get update -y
        APT_UPDATED=true
      fi
      sudo apt-get install -y "$pkg"
      ;;
    fedora)
      sudo dnf install -y "$pkg"
      ;;
    arch)
      sudo pacman -Sy --noconfirm "$pkg"
      ;;
    macos)
      if ! command -v brew >/dev/null 2>&1; then
        warn "Homebrew no detectado. Instalandolo..."
        /bin/bash -c "$(curl_https https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [[ -d /opt/homebrew/bin ]]; then
          export PATH="/opt/homebrew/bin:$PATH"
        elif [[ -d /usr/local/bin ]]; then
          export PATH="/usr/local/bin:$PATH"
        fi
      fi
      brew install "$pkg"
      ;;
    *) die "Modo --local no soportado en '$OS'. Usa el modo Docker por defecto." ;;
  esac
}

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
    if (( major >= 18 )); then
      info "Node.js $(node -v) ya instalado."
      return
    fi
    warn "Node.js $(node -v) detectado pero se requiere >= 18."
  fi
  if [[ ! -d "$HOME/.nvm" ]]; then
    info "Instalando nvm..."
    curl_https https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  export NVM_DIR="$HOME/.nvm"
  # shellcheck disable=SC1091
  [[ -s "$NVM_DIR/nvm.sh" ]] && . "$NVM_DIR/nvm.sh"
  if command -v nvm >/dev/null 2>&1; then
    nvm install --lts >/dev/null
    nvm use --lts >/dev/null
    nvm alias default 'lts/*' >/dev/null
    info "Node.js $(node -v) instalado via nvm."
  else
    warn "No se pudo cargar nvm. Instalando nodejs via gestor de paquetes..."
    ensure_pkg nodejs
  fi
}

ensure_postgres() {
  if command -v psql >/dev/null 2>&1; then
    info "PostgreSQL ya instalado: $(psql --version)."
    return
  fi
  info "Instalando PostgreSQL..."
  case "$OS" in
    debian) ensure_pkg postgresql ;;
    fedora) ensure_pkg postgresql-server ;;
    arch)   ensure_pkg postgresql ;;
    macos)  ensure_pkg postgresql@16 ;;
    *) die "SO no soportado en ensure_postgres: $OS" ;;
  esac
}

start_postgres() {
  if command_exists pg_isready && pg_isready >/dev/null 2>&1; then
    info "PostgreSQL ya esta corriendo."
    return
  fi
  info "Arrancando PostgreSQL..."
  case "$OS" in
    debian) sudo systemctl enable --now postgresql ;;
    fedora)
      sudo postgresql-setup --initdb || true
      sudo systemctl enable --now postgresql
      ;;
    arch) sudo systemctl enable --now postgresql ;;
    macos)
      brew services start postgresql@16
      export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
      ;;
    *) die "SO no soportado en start_postgres: $OS" ;;
  esac
  sleep 2
}

psql_admin() {
  local args=("$@")
  if [[ "$OS" == "macos" ]]; then
    "${args[@]}"
  else
    sudo -u postgres "${args[@]}"
  fi
}

create_db_if_missing() {
  local url creds hostport host port db user pass
  local host_args=()
  url="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/levelutb?schema=public}"
  creds="${url#postgresql://}"
  user="${creds%%:*}"
  pass="${creds#*:}"
  pass="${pass%%@*}"
  hostport="${creds#*@}"
  hostport="${hostport%%/*}"
  host="${hostport%%:*}"
  port="${hostport#*:}"
  db="${creds#*/}"
  db="${db%%\?*}"
  if [[ "$host" != "localhost" && "$host" != "127.0.0.1" ]]; then
    host_args+=(-h "$host")
  fi
  if psql_admin psql "${host_args[@]}" -p "$port" -tAc "SELECT 1 FROM pg_database WHERE datname='$db'" 2>/dev/null | grep -q 1; then
    info "Base de datos '$db' ya existe."
    return
  fi
  if ! psql_admin psql "${host_args[@]}" -p "$port" -tAc "SELECT 1 FROM pg_roles WHERE rolname='$user'" 2>/dev/null | grep -q 1; then
    info "Creando rol '$user'..."
    psql_admin psql "${host_args[@]}" -p "$port" -c "CREATE ROLE \"$user\" LOGIN PASSWORD '$pass';"
  fi
  info "Creando base de datos '$db'..."
  psql_admin createdb "${host_args[@]}" -p "$port" -O "$user" "$db"
  info "Base de datos '$db' creada."
}

main_local() {
  info "$SEP"
  info "LevelUTB - Instalacion automatica (local, sin Docker)"
  info "$SEP"

  case "$OS" in
    windows|wsl) die "El modo --local no esta soportado en Windows/WSL. Usa ./setup.sh (Docker) en su lugar." ;;
    *) ;; # Linux/macOS: continua con la instalacion nativa.
  esac
  command_exists curl || ensure_pkg curl

  ensure_env_auto
  ensure_node
  ensure_postgres

  if [[ "$SKIP_DB" == "false" ]]; then
    start_postgres
    create_db_if_missing
  else
    warn "Omitiendo configuracion de PostgreSQL (--skip-db)."
  fi

  info "Instalando dependencias npm..."
  if [[ -f package-lock.json ]]; then
    npm ci --ignore-scripts
  else
    npm install --ignore-scripts
  fi

  info "Generando cliente Prisma..."
  npm run db:generate

  if [[ "$SKIP_DB" == "false" ]]; then
    info "Sincronizando schema con la base de datos..."
    npm run db:push
    if [[ "$RESEED" == "true" ]]; then
      confirm_destructive "El reseed (db:seed) reemplaza los datos demo."
      npm run db:seed
    else
      info "Poblando base de datos con datos de ejemplo..."
      npm run db:seed-if-empty || npm run db:seed
    fi
  else
    warn "No se ejecuto 'db:push' ni seed (--skip-db)."
  fi

  if command -v code >/dev/null 2>&1; then
    info "Instalando extensiones de VS Code..."
    code --install-extension bradlc.vscode-tailwindcss >/dev/null || true
    code --install-extension prisma.prisma >/dev/null || true
    code --install-extension dbaeumer.vscode-eslint >/dev/null || true
    code --install-extension esbenp.prettier-vscode >/dev/null || true
  else
    warn "VS Code no detectado; se omiten las extensiones."
  fi

  echo ""
  info "$SEP"
  info "Setup local completado."
  info "Inicia el servidor con:  npm run dev"
  info "Abre:                      http://localhost:3000"
  info "Credenciales demo:        demo@utb.edu.co / demo123"
  info "$SEP"
}

# =======================================================
# ENTRADA PRINCIPAL
# =======================================================
if [[ "$LOCAL_MODE" == "true" ]]; then
  main_local
else
  if [[ "$SKIP_DB" == "true" ]]; then
    warn "--skip-db solo aplica a --local; se ignora en modo Docker."
  fi
  main_docker
fi
