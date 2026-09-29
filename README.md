# UTB Gamificación

Plataforma gamificada para el seguimiento del avance académico de estudiantes de la Universidad Tecnológica de Bolívar.

---

## Descripción

Sistema web donde el estudiante visualiza su progreso en la malla curricular, gana puntos e insignias, canjea recompensas académicas por puntos y recibe recomendaciones personalizadas. El docente acompaña a sus estudiantes por curso, verifica misiones con evidencia, aprueba canjes de recompensas y envía rutas recomendadas.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.3.2 (App Router, `src/app`) |
| UI | React 19, Tailwind CSS 4 (`src/app/globals.css`, `postcss.config.mjs`) |
| Base de datos | PostgreSQL |
| ORM | Prisma 7.9.1 (`prisma/schema.prisma`, `prisma.config.ts`, `src/lib/prisma.ts` con `@prisma/adapter-pg`) |
| Autenticación | NextAuth.js 5 beta (JWT + Credentials, `src/lib/auth.ts`) |
| Iconos | lucide-react |
| Temas | next-themes (claro/oscuro, `src/components/providers/ThemeProvider.tsx`) |
| Sesión cliente | `src/components/providers/SessionProvider.tsx` |

---

## Arquitectura Backend y APIs

Next.js funciona como frontend + backend. Las rutas `src/app/api/**/route.ts` son la API privada: validan sesión/rol con `src/lib/session.ts` (`requireRole`, `getSessionContext`), aplican reglas en `src/lib/*` y persisten con Prisma.

```text
Navegador (Client Components en src/app/*/page.tsx)
  |
  v
Next.js App Router (src/app/layout.tsx -> AppShell -> Sidebar/Header)
  |-- middleware.ts: redirige a /login si no hay cookie authjs.session-token
  |-- NextAuth: login con dominio @utb.edu.co + bcrypt (src/lib/auth.ts)
  `-- /api/*: endpoints por rol STUDENT / TEACHER
       |
       v
  src/lib/* (academic, recommendations, streak, activity, missionVerification)
        |
        v
  Prisma Client (src/lib/prisma.ts) -> PostgreSQL (22 modelos)
```

### Capas del backend

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Guard global | `src/middleware.ts` | Deja pasar `/login`, `/api/auth`, estáticos; si no hay cookie de sesión redirige a `/login?callbackUrl=...`. Cada API además valida JSON. |
| Sesión/roles | `src/lib/auth.ts`, `src/lib/session.ts` | `auth()`, `requireRole("STUDENT"\|"TEACHER")`, `jsonUnauthorized`, `jsonForbidden`. Login solo `@utb.edu.co`. |
| Rutas HTTP | `src/app/api/**/route.ts` | Validan entrada, rol y responden JSON. Ver `src/app/api/README.md`. |
| Dominio | `src/lib/` | `academic.ts` (promedio, semestre actual, tope créditos), `recommendations.ts`, `streak.ts`, `activity.ts` (`ACTIVITY_ACTIONS`, racha diaria), `missionRules.ts` + `missionVerification.ts` (auto-verificación), `getBadgeSource.ts` (origen del catálogo de insignias). |
| Persistencia | `src/lib/prisma.ts` | Singleton `PrismaClient` + `PrismaPg`. En dev se reutiliza vía `globalThis`. |
| Modelo | `prisma/schema.prisma` | 22 modelos: usuarios, malla, progreso, gamificación, recompensas, notificaciones, riesgo. |
| Datos | `prisma/seed.ts` | Seed base (programa ISCO 2019, 10 semestres, 55 cursos, 162 créditos, niveles, misiones, recompensas y usuarios demo). |

### Catálogo de APIs

| Endpoint | Métodos | Rol | Función |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | público | Login/logout NextAuth Credentials. |
| `/api/student` | GET | STUDENT | Perfil + stats + racha + insignias recientes (registra `ACADEMIC_DAILY_ACTIVITY`). |
| `/api/curriculum` | GET, POST | STUDENT | GET malla por semestre con estado (aprobado/en curso/bloqueado/disponible), prerrequisitos y créditos. POST selección de cursos del periodo. |
| `/api/stats` | GET | STUDENT | Créditos aprobados/totales, promedio (`academic.ts`), avance por semestre, puntos/nivel, tendencia e insignias obtenidas. |
| `/api/missions` | GET, POST | STUDENT | GET disponibles (por `level`) + estado del estudiante. POST crear/avanzar con `evidence`; si `autoVerify` usa `missionVerification.ts`, si no queda `EN_REVISION`. |
| `/api/rewards` | GET, POST | STUDENT | GET catálogo activo + puntos totales + canjes + cursos del periodo actual para elegir `courseId`. POST solicitar canje `{ rewardId, courseId }` (descuenta puntos, estado `SOLICITADO`). |
| `/api/badges` | GET | STUDENT | Catálogo de insignias para el panel de tarjetas base y Plus. El origen se resuelve con `getBadgeSource()` y la respuesta incluye `origin{source, catalogVersion, degraded}`. |
| `/api/notifications` | GET, PATCH, DELETE | ambos | Listar, marcar leída (`isRead`), borrar. Tipos: `INFO, WARNING, ALERTA_RIESGO, LOGRO_OBTENIDO, MISION_DISPONIBLE, RECORDATORIO, SOLICITUD_RECOMPENSA`. |
| `/api/recommendations` | GET, PATCH | STUDENT | GET genera bajo demanda con `generateRecommendations()`. PATCH aceptar/descartar (`isAccepted`, `isRead`). |
| `/api/search` | GET `?q=` | ambos | Búsqueda global (cursos, misiones, insignias) insensible a tildes. |
| `/api/teacher` | GET, PATCH | TEACHER | GET cuatro cursos demo asignados (`TeacherCourse` por `periodo YYYY-1/2`) + estudiantes con promedio/créditos/racha/riesgo e insignias con contador de progreso. PATCH revisar misión (aprobar/devolver con `reviewComment`, otorga puntos). |
| `/api/teacher/rewards` | GET, PATCH | TEACHER | GET solicitudes de canje de sus cursos + historial. PATCH aprobar/rechazar (`APROBADO/RECHAZADO`, `reviewNote`). |
| `/api/teacher/notify` | POST | TEACHER | `{ studentId, message/cursos }` envía notificación de ruta recomendada y guarda `Activity{RUTA_RECOMENDADA_DOCENTE}`. |

Errores estándar: `401 { error: "No autorizado" }` sin sesión, `403` rol incorrecto, `404` perfil/recurso no encontrado.

Detalle de flujos y cómo añadir endpoints: ver `src/app/api/README.md`.

---

## Funcionalidades

### Estudiantes (`/dashboard`, `/malla`, `/misiones`, `/logros`, `/recompensas`, `/estadisticas`, `/notificaciones`, `/perfil`)

- **Dashboard**: puntos, nivel, racha, misiones activas, insignias recientes, notificaciones y alertas.
- **Malla interactiva**: por semestre con estado por prerrequisitos, créditos aprobados vs totales y selección de materias del periodo.
- **Misiones**: tipos `ACADEMICO, PLANIFICACION, MEJORA_CONTINUA, HABITO_ESTUDIO, IMPACTO_SOCIAL`. Manuales con evidencia + revisión docente, o automáticas (`verificationKey/Value`: créditos, promedio, racha) vía `missionVerification.ts`. Estados: `PENDIENTE → EN_PROGRESO → EN_REVISION → COMPLETADA/VERIFICADA/RECHAZADA`.
- **Insignias**: panel visual con tarjetas de Core Skills, Power Skills, Líderes UTB y Conexiones Profesionales, incluyendo sus variantes Plus. El catálogo puede venir de la API externa o del catálogo local y muestra su origen.
- **Recompensas**: canje de puntos por bonificaciones (`EXAMEN, ASISTENCIA, ENTREGA, OTRO`) atadas a un `courseId` del periodo actual. Flujo `SOLICITADO → APROBADO/RECHAZADO → USADO/EXPIRADO`. Página `/recompensas`.
- **Recomendaciones**: cuello de botella, reprobadas, electivas, ruta del próximo semestre, promedio < 3.5, rellenar créditos.
- **Estadísticas**: créditos, promedio, nivel, tendencia y distribución por semestre.
- **Perfil**: datos académicos, nivel e insignias recientes.
- **Responsive + modo claro/oscuro** (`next-themes`, `AppShell` + `Sidebar`/`Header`).

### Docentes (`/docentes`, `/docentes/insignias`, `/perfil-docente`)

- **Acompañamiento**: cuatro cursos asignados del periodo como bloques interactivos + estudiantes inscritos (promedio, créditos, racha, insignias, riesgo).
- **Insignias del curso**: `/docentes/insignias` resume las cuatro categorías y sus variantes Plus. Al expandir un estudiante se muestra cada insignia con el color de su categoría y un contador sencillo `1/1`.
- **Verificación de misiones**: aprobar/devolver con comentario (otorga `Point{MISION_COMPLETADA}`).
- **Recompensas**: aprobar/rechazar canjes de sus cursos.
- **Enviar ruta recomendada**: notificación al estudiante + registro en `Activity`.
- **Perfil docente**: facultad, departamento, profesión, cargo, conteo de estudiantes y misiones pendientes.

---

## Sistema de Gamificación

### Puntos (`Point.source`)

`MISION_COMPLETADA, RENDIMIENTO_ACADEMICO, MEJORA_PROMEDIO, CONSISTENCIA, IMPACTO_SOCIAL, EVENTO_ESPECIAL`.

### Niveles (`Level`, seed en `prisma/seed.ts`)

| # | Nombre | Puntos mínimos |
|---|---|---|
| 1 | Novato | 0 |
| 2 | Aprendiz | 500 |
| 3 | Explorador | 1500 |
| 4 | Avanzado | 3000 |
| 5 | Maestro | 5000 |
| 6 | Leyenda | 8000 |

### Insignias (`Badge.category`)

`PROGRESO, RENDIMIENTO, HABITO, COMPETENCIA, IMPACTO_SOCIAL`.

### Misiones (`Mission.type`)

`ACADEMICO, PLANIFICACION, MEJORA_CONTINUA, HABITO_ESTUDIO, IMPACTO_SOCIAL`.

### Recompensas (`Reward.category`)

`EXAMEN (exonerar/mejorar nota), ASISTENCIA (limpiar falta), ENTREGA (extender/reintentar), OTRO`. Campos: `cost` en puntos, `maxUses`, `isActive`.

### Recomendaciones

Motor `src/lib/recommendations.ts`: prerrequisitos que más desbloquean (alta), reprobadas (alta), promedio bajo (alta), ruta siguiente semestre (media), electivas desbloqueadas (baja), rellenar créditos.

### Riesgo (`RiskAlert`)

`PREREQUISITO_FALTANTE, ATRASO_CREDITOS, BAJO_PROMEDIO, CURSO_EN_RIESGO, SEMESTRE_RETRASADO` con severidad `BAJA/MEDIA/ALTA/CRITICA`.

---

## Estructura del Proyecto

```text
utb-gamificacion/
  .env / .env.example        # DATABASE_URL, NEXTAUTH_SECRET/URL (ver Instalación)
  setup.sh                   # Instalación automática (Node via nvm, Postgres, .env, db:push, seed)
  next.config.ts / tsconfig.json / eslint.config.mjs / postcss.config.mjs / prisma.config.ts
  public/utb-logotipo.png
  scripts/                   # (vacía, utilidades futuras)
  prisma/
    schema.prisma            # 22 modelos
    migrations/              # Migraciones SQL
    seed.ts                  # Seed base: ISCO 2019 + insignias + usuarios demo
  src/
    middleware.ts            # Guard de páginas -> /login
    app/
      layout.tsx / globals.css / page.tsx (-> /dashboard) / favicon.ico
      login/ dashboard/ malla/ misiones/ logros/ recompensas/
      estadisticas/ notificaciones/ perfil/ docentes/ docentes/insignias/ perfil-docente/
      api/                   # Backend (ver src/app/api/README.md)
    components/
      layout/AppShell.tsx    # Oculta Sidebar/Header en /login
      layout/Sidebar.tsx / layout/Header.tsx  # Nav por rol + búsqueda global
      providers/SessionProvider.tsx / providers/ThemeProvider.tsx
    lib/
      auth.ts / session.ts / prisma.ts
      academic.ts (+ academic.test.ts)
      recommendations.ts / streak.ts / activity.ts
      missionRules.ts (+ missionRules.test.ts) / missionVerification.ts
      badgeSource.ts / getBadgeSource.ts # Origen del catálogo de insignias
```

Estructura detallada del frontend: `src/app/README.md`. Estructura del backend: `src/app/api/README.md`.

---

## Instalación

### Opción A: Docker (recomendado, multiplataforma)

Único prerrequisito: **Docker Desktop** (Windows, macOS o Linux). No necesitas Node, PostgreSQL ni npm en el host — la imagen `Dockerfile` usa `node:20-alpine`.

#### Windows, macOS o Linux con Docker Desktop

```powershell
git clone <url-del-repositorio>
cd utb-gamificacion
Copy-Item .env.example .env       # PowerShell; en Bash usa: cp .env.example .env
docker compose up --build -d
```

Abre `http://localhost:3000`. El primer arranque crea el esquema, siembra la
base solo si está vacía y levanta la API externa simulada en `http://localhost:3001`.

Para ver el estado o los logs:

```powershell
docker compose ps
docker compose logs -f app
```

Para detener los servicios sin borrar datos:

```powershell
docker compose down
```

Para reiniciar la base demo desde cero:

```powershell
docker compose down -v
docker compose up --build -d
```

El último comando elimina el volumen de PostgreSQL y todos sus datos.

`docker compose up --build` ejecuta en el contenedor del `app`:
`prisma db push` (crea el schema) → `db:seed-if-empty` (siembra datos solo si la base está vacía) → `npm run dev`.

| Servicio | Puerto | Descripción |
|---|---|---|
| `app` | 3000 | Next.js — http://localhost:3000 |
| `db` | 5432 | PostgreSQL 16 (volumen `utb-gamificacion_pgdata`) |
| `external-academic-api` | 3001 | API académica e insignias simuladas |

Comandos útiles:

```bash
docker compose ps        # estado de los servicios
docker compose logs -f app
docker compose down      # parar (conserva el volumen de datos)
docker compose down -v   # parar y BORRAR la base de datos
```

#### Instalación local con `setup.sh` (Linux/macOS)

`setup.sh` instala Node.js LTS mediante nvm, PostgreSQL, dependencias npm,
genera `.env` si no existe, crea la base de datos, ejecuta `db:generate`,
`db:push` y el seed demo. El seed es destructivo.

```bash
git clone <url-del-repositorio>
cd utb-gamificacion
chmod +x setup.sh
./setup.sh
npm run dev
```

Abre `http://localhost:3000`. Para instalar dependencias sin crear o modificar
la base de datos:

```bash
./setup.sh --skip-db
```

> En Windows no se ejecuta `setup.sh` directamente; usa Docker Desktop y los
> pasos anteriores de PowerShell.

**El seed automático no destruye datos.** `prisma/seed.ts` hace `deleteMany()`, por eso el arranque usa `prisma/seed-if-empty.ts`, que siembra únicamente si la tabla `users` está vacía. Si ya trabajaste con datos reales, tu base se conserva. Para sembrar a mano (destructivo):

```bash
npm run db:seed               # siembra desde cero (borra lo anterior)
docker compose exec -T app npm run db:seed
```

### Opción B: Local con Node + PostgreSQL

> Requiere Node.js 18+ y PostgreSQL en el host. No necesitas PostgreSQL si vas por la Opción A.

#### Prerrequisitos

- Node.js 18+
- PostgreSQL
- npm
- Bash (Linux/macOS; `setup.sh` no corre en Windows)

#### Método rápido (solo Linux/macOS)

```bash
./setup.sh            # Completa: Node, Postgres, .env, dependencias, db:push, seed
./setup.sh --skip-db  # Solo npm install, sin tocar Postgres
```

Detecta Debian/Fedora/Arch/macOS, instala Node >=18 vía nvm, crea usuario/DB, genera `.env` desde `.env.example`, hace `db:generate + db:push + db:seed`.

> Si ya tienes PostgreSQL 18 corriendo en el puerto 5432, choca con el puerto publicado del contenedor. Detén el servicio local o cambia el puerto en `docker-compose.yml`.

#### Método manual

1. Clonar e instalar:

```bash
git clone <url-del-repositorio>
cd utb-gamificacion
npm install
```

2. Variables de entorno (`.env`, plantilla completa en `.env.example`):

```bash
cp .env.example .env     # en Windows: copy .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/utb_gamificacion?schema=public"
NEXTAUTH_SECRET="cambia-este-secreto-por-uno-seguro"
NEXTAUTH_URL="http://localhost:3000"
UNIVERSITY_API_URL="http://localhost:3001"
UNIVERSITY_API_KEY="dev-key"
UNIVERSITY_API_ENABLED="false"
```

Con `UNIVERSITY_API_ENABLED="true"` el curriculum y el perfil del estudiante leen de la API externa en vez de Prisma directo.

3. DB + seed:

```bash
npm run db:generate
npm run db:push
npm run db:seed        # seed base (tsx prisma/seed.ts)
```

4. Dev:

```bash
npm run dev
# http://localhost:3000  -> redirige a /dashboard (o /login sin sesión)
```

---

## Credenciales de Prueba (`npm run db:seed` → `prisma/seed.ts`)

El email debe terminar en `@utb.edu.co` (validado en `src/lib/auth.ts`).

| Rol | Email | Contraseña | Nombre / uso |
|---|---|---|---|
| STUDENT | demo@utb.edu.co | demo123 | Juan Pérez — 6to semestre, 95 créditos |
| STUDENT | demo2@utb.edu.co | demo1234 | Sara Peña — 8vo semestre, 113 créditos |
| STUDENT | juanito@utb.edu.co | demo1234 | Angela Lemus — 3er semestre, 60 créditos |
| TEACHER | docente@utb.edu.co | demo123 | María González — cursos H01A, M01A, C02A y C04A |

---

## Comandos Disponibles

```bash
docker compose up -d      # Levanta app + db + api externa (Opción A)
docker compose down       # Para los servicios (conserva datos)
docker compose down -v    # Para y borra la base de datos

./setup.sh              # Instalación completa (solo Linux/macOS)
./setup.sh --skip-db    # Solo dependencias npm

npm run dev              # Dev con hot reload
npm run build            # Build producción
npm run start            # Servidor producción

npm run db:generate      # Generar cliente Prisma
npm run db:push          # Sincronizar schema (sin migraciones)
npm run db:seed          # Seed base DESTRUCTIVO (tsx prisma/seed.ts)
npm run db:seed-if-empty # Seed solo si la tabla users está vacía (no destructivo)
npm run db:studio        # Prisma Studio GUI

npm run lint             # ESLint (next + TS)
npm run test:unit        # Tests unitarios (tsx --test src/lib/**/*.test.ts)
```

---

## Modelos de Base de Datos (22)

### Usuarios y auth

- **User**: email institucional único, nombre, `passwordHash` (bcrypt), rol `STUDENT/TEACHER/ADMIN`.
- **StudentProfile**: `studentCode`, `programId`, `currentSemester`, `totalCredits`, `averageGrade`, `level`.
- **TeacherProfile**: departamento, facultad, profesión, cargo, `isActive`.

### Académico

- **Program**: ej. ISCO `Ingeniería de Sistemas`, 162 créditos, 10 semestres, versión `2019`.
- **Semester / Course / Prerequisite**: cursos por semestre, tipo `OBLIGATORIO/ELECTIVA/LIBRE_ELECCION/GENERAL`, prerrequisito `REQUIRED/COREQUISITE`.
- **Enrollment**: `{ studentId, courseId, semesterCode YYYY-1/2 }` único, estado `INSCRITO/CURSANDO/APROBADO/REPROBADO/RETIRADO/CANCELADO`, `grade`, origen `UNIVERSITY/MANUAL`.
- **AcademicRecord**: historial importado (`courseCode, grade, semester, year, credits`, estado `APROBADO/REPROBADO/EN_CURSO/PENDIENTE`).
- **TeacherCourse**: `{ teacherId, courseId, period }` único.

### Gamificación

- **Point**: `amount + source + description`.
- **Mission**: `type, pointsReward, autoVerify + verificationKey/Value, courseId?, requiredLevel?, isActive, start/endDate`.
- **StudentMission**: `status, progress 0-100, evidence, metadata JSON, verifiedBy/At, reviewComment`, único por estudiante+misión.
- **Badge**: `category, iconUrl, requiredLevel?, pointsRequired?`.
- **StudentBadge**: único por estudiante+insignia.
- **Level**: `number, name, minPoints`.

### Recompensas

- **Reward**: `name, icon, category EXAMEN/ASISTENCIA/ENTREGA/OTRO, cost, maxUses?, isActive`.
- **StudentReward**: `{ studentId, rewardId }` único, `courseId` objetivo, `status SOLICITADO/APROBADO/RECHAZADO/EXPIRADO/USADO`, `pointsSpent, requestedAt, reviewedBy/At, reviewNote, evidence, expiresAt`.

### Notificaciones, actividad, recomendaciones, riesgo

- **Notification**: `title, message, type, isRead, link?`.
- **Activity**: `{ action, details Json? }`, acciones en `ACTIVITY_ACTIONS` (`LOGIN, PAGE_VIEW, ACADEMIC_DAILY_ACTIVITY, RUTA_RECOMENDADA_DOCENTE...`) para rachas.
- **Recommendation**: `type CURSO_SUGERIDO/RUTA_ACademica/ALERTA_ATRASO/MEJORA_PROMEDIO/ELECTIVA_RECOMENDADA/RELLENAR_CREDITOS, priority 1=alta 2=media 3=baja, isRead, isAccepted?`.
- **RiskAlert**: `type + severity BAJA/MEDIA/ALTA/CRITICA, courseId?, isResolved?`.

---

## Seguridad

- Solo `@utb.edu.co` (`src/lib/auth.ts` authorize), bcrypt, JWT.
- `src/middleware.ts` protege páginas; cada API revalida con `requireRole` (no confiar solo en el middleware, cuyo `matcher` excluye `/api`).
- Validación de entrada y 401/403/404 JSON en todos los endpoints.

---

## Origen de las insignias (`src/lib/getBadgeSource.ts`)

`/api/badges` no lee el catálogo directo de Prisma: lo pide a un `BadgeSource`
que se elige con `UNIVERSITY_API_ENABLED`, igual que la malla con `AcademicSource`.

| Config | `BadgeSource` | Resultado en `/logros` |
|---|---|---|
| `UNIVERSITY_API_ENABLED="false"` | `PrismaBadgeSource` | Catálogo del seed (`BADGES_DATA` en `prisma/seed.ts`) |
| `UNIVERSITY_API_ENABLED="true"` | `HttpBadgeSource` | Catálogo de la universidad vía `GET /academic/students/:code/badges` |

**No fusionan: se reemplazan.** Con la API activa no se ven las insignias del
seed, y viceversa.

Si la API externa no responde, `HttpBadgeSource` lanza `ExternalApiUnavailableError`
y la ruta **degrada al catálogo local** con `origin.degraded=true`, en vez de
cortar con 503 como hacen `curriculum`/`student`. Un 404 externo (el estudiante no
está registrado allá) devuelve catálogo vacío sin degradar: es un dato faltante,
no una caída del servicio.

### API de insignias de ejemplo

`utb-external-api` expone el contrato que la universidad publicaría:

| Endpoint | Devuelve |
|---|---|
| `GET /academic/badges` | `{ catalogVersion, issuer, total, badges[] }` — catálogo completo |
| `GET /academic/students/:studentCode/badges` | `{ studentCode, catalogVersion, issuer, total, earned, totalEarned, earnedBadges[], badges[] }` — catálogo con estado resuelto por estudiante |

Los datos salen de `utb-external-api/src/fixtures/badges.json` (8 insignias del
nuevo modelo: cuatro categorías base y cuatro variantes Plus, otorgadas para los
tres estudiantes demo). Es una simulación: cuando exista el
servicio institucional real solo cambia la URL en `UNIVERSITY_API_URL` y el
consumidor no se toca. `BadgeCategory` de la API externa es el mismo enum del
modelo local (`PROGRESO`, `RENDIMIENTO`, `HABITO`, `COMPETENCIA`, `IMPACTO_SOCIAL`),
porque `/logros` filtra por esa taxonomía.

---

## Integraciones Futuras

- **PROA**: mallas académicas.
- **Banner**: registro académico oficial.
- **API institucional de insignias**: sustituir la simulación de `utb-external-api`.

---

## Licencia

Proyecto académico - Universidad Tecnológica de Bolívar.
