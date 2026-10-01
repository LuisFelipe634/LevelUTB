#!/usr/bin/env bash
# =======================================================
# setup.sh - Configura LevelUTB en un dispositivo nuevo
#
# Uso:
#   ./setup.sh           # Instala lo necesario y deja todo listo
#   ./setup.sh --skip-db # Instala dependencias sin tocar PostgreSQL
# =======================================================
set -euo pipefail

# ---------- Colores ----------
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
SEP="=============================="
HTTPS_ONLY='=https'

info()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn()  { echo -e "${YELLOW}[setup]${NC} $*"; }
error() { echo -e "${RED}[setup]${NC} $*" >&2; }

# ---------- Flags ----------
SKIP_DB=false
for arg in "$@"; do
  case "$arg" in
    --skip-db) SKIP_DB=true ;;
    *) warn "Flag desconocida: $arg" ;;
  esac
done

# ---------- Deteccion de SO ----------
detect_os() {
  if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "macos"
  elif [[ -f /etc/os-release ]]; then
    . /etc/os-release
    case "$ID" in
      ubuntu|debian|linuxmint) echo "debian" ;;
      fedora|rhel|centos)      echo "fedora" ;;
      arch|manjaro)            echo "arch" ;;
      *) echo "unknown" ;;
    esac
  else
    echo "unknown"
  fi
}

OS=$(detect_os)
if [[ "$OS" == "unknown" ]]; then
  error "Sistema operativo no soportado. Edita setup.sh para adaptarlo."
  exit 1
fi
info "Sistema detectado: $OS"

# ---------- PATH de Homebrew (macOS) ----------
if [[ "$OS" == "macos" ]]; then
  if [[ -d /opt/homebrew/bin ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
  elif [[ -d /usr/local/bin ]]; then
    export PATH="/usr/local/bin:$PATH"
  fi
fi

# ---------- Instalacion de paquetes por gestor ----------
ensure_pkg() {
  local pkg="$1"
  case "$OS" in
    debian)
      sudo apt-get update -y
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
        /bin/bash -c "$(curl -fsSL --proto ${HTTPS_ONLY} --proto-redir ${HTTPS_ONLY} https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        if [[ -d /opt/homebrew/bin ]]; then
          export PATH="/opt/homebrew/bin:$PATH"
        elif [[ -d /usr/local/bin ]]; then
          export PATH="/usr/local/bin:$PATH"
        fi
      fi
      brew install "$pkg"
      ;;
    *) error "SO no soportado en ensure_pkg: $OS"; exit 1 ;;
  esac
}

# ---------- Instalacion de Node.js (>=18) ----------
ensure_node() {
  if command -v node >/dev/null 2>&1; then
    local major
    major=$(node -e "console.log(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)
    if (( major >= 18 )); then
      info "Node.js $(node -v) ya instalado."
      return
    fi
    warn "Node.js $(node -v) detectado pero se requiere >= 18. Instalando version reciente..."
  fi

  # Via nvm (evita permisos de root y versiones inconsistentes)
  if [[ ! -d "$HOME/.nvm" ]]; then
    info "Instalando nvm..."
    curl -fsSL --proto ${HTTPS_ONLY} --proto-redir ${HTTPS_ONLY} https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi

  export NVM_DIR="$HOME/.nvm"
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

# ---------- Instalacion de PostgreSQL ----------
ensure_postgres() {
  if command -v psql >/dev/null 2>&1; then
    info "PostgreSQL ya instalado: $(psql --version | sed 's/psql (PostgreSQL) //')."
    return
  fi
  info "Instalando PostgreSQL..."
  case "$OS" in
    debian) ensure_pkg postgresql ;;
    fedora) ensure_pkg postgresql-server ;;
    arch)   ensure_pkg postgresql ;;
    macos)  ensure_pkg postgresql@16 ;;
    *) error "SO no soportado en ensure_postgres: $OS"; exit 1 ;;
  esac
}

# ---------- Arrancar el servicio de PostgreSQL ----------
start_postgres() {
  if pg_isready >/dev/null 2>&1; then
    info "PostgreSQL ya esta corriendo."
    return
  fi
  info "Arrancando PostgreSQL..."
  case "$OS" in
    debian)
      sudo systemctl enable --now postgresql
      ;;
    fedora)
      sudo postgresql-setup --initdb || true
      sudo systemctl enable --now postgresql
      ;;
    arch)
      sudo systemctl enable --now postgresql
      ;;
    macos)
      brew services start postgresql@16
      export PATH="$(brew --prefix postgresql@16)/bin:$PATH"
      ;;
    *) error "SO no soportado en start_postgres: $OS"; exit 1 ;;
  esac
  sleep 2
}

# ---------- Ejecutar psql como administrador ----------
# En Linux el superusuario es el rol 'postgres' (vias sudo).
# En macOS/Homebrew el superusuario es el usuario actual del sistema.
psql_admin() {
  if [[ "$OS" == "macos" ]]; then
    "$@"
  else
    sudo -u postgres "$@"
  fi
}

# ---------- Crear usuario y base de datos ----------
create_db_if_missing() {
  local url creds hostport host port db user pass
  local host_args=()
  url="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/levelutb?schema=public}"

  # Parsea la URL sin depender de python (formato: postgresql://user:pass@host:port/db?schema=public)
  creds="${url#postgresql://}"          # user:pass@host:port/db?schema=public
  user="${creds%%:*}"                   # user
  pass="${creds#*:}"                    # pass@host:port/db?schema=public
  pass="${pass%%@*}"                    # pass
  hostport="${creds#*@}"                # host:port/db?schema=public
  hostport="${hostport%%/*}"            # host:port
  host="${hostport%%:*}"                # host
  port="${hostport#*:}"                 # port
  db="${creds#*/}"                      # db?schema=public
  db="${db%%\?*}"                       # db

  # Para localhost se usa el socket Unix (auth peer), evita pedir password por TCP
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

# =======================================================
# METODO PRINCIPAL
# =======================================================
main() {
  info "$SEP"
  info "LevelUTB - Setup"
  info "$SEP"

  # Cargar primero la configuracion para que la creacion de PostgreSQL use
  # exactamente la DATABASE_URL elegida por el usuario.
  if [[ -f .env ]]; then
    info ".env ya existe. Manteniendolo sin cambios."
  else
    info "Creando .env con valores locales por defecto..."
    cp .env.example .env
    warn "IMPORTANTE: edita '.env' si tus credenciales difieren del default."
  fi
  set -a; . ./.env; set +a

  ensure_node
  ensure_postgres

  if [[ "$SKIP_DB" == "false" ]]; then
    start_postgres
    create_db_if_missing
  else
    warn "Omitiendo configuracion de PostgreSQL (--skip-db)."
  fi

  # Dependencias npm
  info "Instalando dependencias npm..."
  npm install --ignore-scripts

  # Prisma
  info "Generando cliente Prisma..."
  npm run db:generate

  if [[ "$SKIP_DB" == "false" ]]; then
    info "Sincronizando schema con la base de datos..."
    npm run db:push
    info "Poblando base de datos con datos de ejemplo..."
    npm run db:seed
  else
    warn "No se ejecuto 'db:push' ni 'db:seed' (--skip-db)."
  fi

  # Extensiones de VS Code (si esta disponible)
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
  info "Setup completado."
  info "Inicia el servidor con:  npm run dev"
  info "Abre:                      http://localhost:3000"
  info "Credenciales demo:        demo@utb.edu.co / demo123"
  info "$SEP"
}

main "$@"