# LevelUTB

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
| Utilidades | `src/lib/period.ts` (períodos académicos centralizados) |

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
  Prisma Client (src/lib/prisma.ts) -> PostgreSQL (24 modelos)
```

### Capas del backend

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Guard global | `src/middleware.ts` | Deja pasar `/login`, `/api/auth`, estáticos; si no hay cookie de sesión redirige a `/login?callbackUrl=...`. Cada API además valida JSON. |
| Sesión/roles | `src/lib/auth.ts`, `src/lib/session.ts` | `auth()`, `requireRole("STUDENT"\|"TEACHER")`, `jsonUnauthorized`, `jsonForbidden`. Login solo `@utb.edu.co`. |
| Rutas HTTP | `src/app/api/**/route.ts` | Validan entrada, rol y responden JSON. Ver `src/app/api/README.md`. |
| Dominio | `src/lib/` | `academic.ts` (promedio, semestre actual, tope créditos), `recommendations.ts`, `streak.ts`, `activity.ts` (`ACTIVITY_ACTIONS`, racha diaria), `missionRules.ts` + `missionVerification.ts` (auto-verificación), `getBadgeSource.ts` (origen del catálogo de insignias), `period.ts` (períodos académicos centralizados). |
| Persistencia | `src/lib/prisma.ts` | Singleton `PrismaClient` + `PrismaPg`. En dev se reutiliza vía `globalThis`. |
| Modelo | `prisma/schema.prisma` | 24 modelos: usuarios, malla, progreso, gamificación, recompensas, notificaciones, riesgo. |
| Datos | `prisma/seed.ts` | Seed base (programa ISCO 2019, 10 semestres, 55 cursos, 162 créditos, niveles, misiones, recompensas y usuarios demo). |

### Catálogo de APIs

| Endpoint | Métodos | Rol | Función |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | público | Login/logout NextAuth Credentials. |
| `/api/curriculum` | GET, POST | STUDENT | GET malla por semestre con estado (aprobado/en curso/bloqueado/disponible), prerrequisitos y créditos. POST selección de cursos del periodo. |
| `/api/stats` | GET | STUDENT | Créditos aprobados/totales, promedio (`academic.ts`), avance por semestre, puntos/nivel, tendencia e insignias obtenidas. |
| `/api/missions` | GET, POST | STUDENT | GET disponibles (por `level`) + estado del estudiante. POST crear/avanzar con `evidence`; si `autoVerify` usa `missionVerification.ts`, si no queda `EN_REVISION`. |
| `/api/rewards` | GET, POST | STUDENT | GET catálogo activo + puntos totales + canjes + cursos del periodo actual para elegir `courseId`. POST solicitar canje `{ rewardId, courseId }` (descuenta puntos, estado `SOLICITADO`). |
| `/api/badges` | GET | STUDENT | Catálogo de insignias para el panel de tarjetas base y Plus. El origen se resuelve con `getBadgeSource()` y la respuesta incluye `origin{source, catalogVersion, degraded}`. |
| `/api/notifications` | GET, PATCH, DELETE | ambos | Listar, marcar leída (`isRead`), borrar. Tipos: `INFO, WARNING, ALERTA_RIESGO, LOGRO_OBTENIDO, MISION_DISPONIBLE, RECORDATORIO, SOLICITUD_RECOMPENSA`. |
| `/api/recommendations` | GET, PATCH | STUDENT | GET genera bajo demanda con `generateRecommendations()`. PATCH aceptar/descartar (`isAccepted`, `isRead`). |
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
- **Insignias**: panel visual con tarjetas de Core Skills, Power Skills, Líderes UTB y Conexiones Profesionales, incluyendo sus variantes Plus. El catálogo se sirve desde la API externa.
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
LevelUTB/
  .env / .env.example        # DATABASE_URL, NEXTAUTH_SECRET/URL (ver Instalación)
  next.config.ts / tsconfig.json / eslint.config.mjs / postcss.config.mjs / prisma.config.ts
  public/utb-logotipo.png
  scripts/                   # import-proa.ts, sync-badges.ts, badges.json
  prisma/
    schema.prisma            # 24 modelos
    migrations/              # Migraciones SQL
    seed.ts                  # Seed base: ISCO 2019 + insignias + usuarios demo
    seed-if-empty.ts         # Seed condicional (solo si users está vacía)
  src/
    middleware.ts            # Guard de páginas -> /login
    app/
      layout.tsx / globals.css / page.tsx (-> /dashboard) / favicon.ico
      login/ dashboard/ malla/ misiones/ logros/ recompensas/
      estadisticas/ notificaciones/ perfil/ docentes/ docentes/insignias/ perfil-docente/
      api/                   # Backend (ver docs/arc42.md §5)
    components/
      layout/AppShell.tsx    # Oculta Sidebar/Header en /login
      layout/Sidebar.tsx / layout/Header.tsx  # Navegación por rol, logo y acciones
      providers/SessionProvider.tsx / providers/ThemeProvider.tsx
    lib/
      auth.ts / session.ts / prisma.ts
      academic.ts (+ academic.test.ts)
      recommendations.ts / streak.ts / activity.ts
      missionRules.ts (+ missionRules.test.ts) / missionVerification.ts
      badgeSource.ts / getBadgeSource.ts # Origen del catálogo de insignias
      period.ts              # Utilidad centralizada de períodos académicos
```

Estructura detallada: `docs/arc42.md` (§5 vista de bloques, §7 despliegue).

---

## Instalación

### Instalación recomendada: Docker Desktop

Docker es el único método soportado para preparar el proyecto de forma igual en
Windows, macOS y Linux. No necesitas instalar Node.js, npm ni PostgreSQL en el
equipo anfitrión.

#### 1. Instalar requisitos

1. Instala Docker Desktop desde <https://www.docker.com/products/docker-desktop/>.
2. Inicia Docker Desktop y espera a que indique que el motor está ejecutándose.
3. Instala Git desde <https://git-scm.com/downloads>.
4. Comprueba las versiones:

```bash
docker --version
docker compose version
git --version
```

#### 2. Descargar el proyecto

Sustituye `<url-del-repositorio>` por la URL real del repositorio:

```bash
git clone <url-del-repositorio>
cd LevelUTB
```

#### 3. Crear la configuración local

En Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

En macOS o Linux:

```bash
cp .env.example .env
```

Abre `.env` y cambia como mínimo `NEXTAUTH_SECRET` por una cadena larga y
privada. Conserva estos valores para ejecutar la configuración incluida:

```env
POSTGRES_DB="levelutb"
POSTGRES_USER="postgres"
POSTGRES_PASSWORD="postgres"
UNIVERSITY_API_URL="http://external-academic-api:3001"
UNIVERSITY_API_KEY="dev-key"
UNIVERSITY_API_ENABLED="true"
```

No subas `.env` al repositorio. Contiene credenciales locales y secretos.

#### 4. Construir y lanzar

Desde la raíz del proyecto ejecuta:

```bash
docker compose up --build -d
```

El arranque realiza este proceso automáticamente:

1. Inicia PostgreSQL y espera a que esté saludable.
2. Inicia `external-academic-api` con `utb-external-api/src/fixtures/seed.json`.
3. Ejecuta `prisma db push` para preparar el esquema de soporte.
4. Ejecuta `db:seed-if-empty` para crear usuarios, misiones, recompensas y
  configuración de gamificación sin borrar datos existentes.
5. Inicia Next.js.

La malla, los cursos y los historiales académicos se leen exclusivamente desde
la API externa. PostgreSQL se mantiene para autenticación, perfiles locales,
gamificación, notificaciones y solicitudes de recompensa.

#### 5. Comprobar el lanzamiento

```bash
docker compose ps
docker compose logs --tail=50 app
docker compose logs --tail=50 external-academic-api
```

Debes ver `healthy` en `db`, `Ready` en `app` y `Server listening` en la API
externa. Abre <http://localhost:3000> y entra con una credencial de prueba.

Servicios disponibles:

| Servicio | Dirección | Uso |
|---|---|---|
| Aplicación | <http://localhost:3000> | Interfaz LevelUTB |
| API académica | <http://localhost:3001> | Seed externo y datos académicos |
| PostgreSQL | `localhost:5432` | Estado local de autenticación y gamificación |

#### 6. Reiniciar sin perder datos

```bash
docker compose restart
```

Después de cambiar `.env`, recrea los servicios para que reciban las nuevas
variables:

```bash
docker compose up -d --force-recreate
```

#### 7. Sembrar nuevamente la información demo

El seed destructivo reemplaza los datos de soporte y gamificación:

```bash
docker compose exec -T app npm run db:seed
```

La API académica no requiere un comando de seed separado: carga su información
automáticamente desde `utb-external-api/src/fixtures/seed.json` al iniciar.

#### 8. Reinicializar completamente el entorno

Esto elimina el volumen PostgreSQL y todos los datos locales. Úsalo solo en una
instalación de desarrollo:

```bash
docker compose down -v
docker compose up --build -d
```

#### 9. Detener el proyecto

```bash
docker compose down
```

Este comando detiene los contenedores y conserva el volumen de datos.

---

## Credenciales de Prueba (`npm run db:seed` → `prisma/seed.ts`)

El email debe terminar en `@utb.edu.co` (validado en `src/lib/auth.ts`).

| Rol | Email | Contraseña | Nombre / uso |
|---|---|---|---|
| STUDENT | demo@utb.edu.co | demo123 | Juan Pérez — 6to semestre, 95 créditos |
| STUDENT | demo2@utb.edu.co | demo1234 | Sara Peña — 8vo semestre, 113 créditos |
| STUDENT | demo3@utb.edu.co | demo1234 | Angela Lemus — 3er semestre, 60 créditos |
| TEACHER | docente@utb.edu.co | demo123 | María González — cursos H01A, M01A, C02A y C04A |

## Comandos Disponibles

```bash
docker compose up --build -d  # Construye y levanta todos los servicios
docker compose ps              # Comprueba el estado de los contenedores
docker compose logs --tail=50  # Consulta los logs de todos los servicios
docker compose restart         # Reinicia sin eliminar datos
docker compose down            # Detiene los servicios y conserva datos
docker compose down -v         # Detiene y elimina el volumen PostgreSQL

docker compose exec app npm run db:seed          # Seed destructivo
docker compose exec app npm run db:seed-if-empty # Seed no destructivo
docker compose exec app npm run lint              # Lint dentro del contenedor
```

---

## Modelos de Base de Datos (2

## Mejoras Recientes (Limpieza y Refactor)

### Limpieza de Código
- **Dependencias eliminadas**: clsx y tailwind-merge (no utilizadas en el código)
- **Documentación redundante eliminada**: src/app/README.md y src/app/api/README.md (contenido consolidado en README.md y docs/arc42.md)
- **Comentarios narrativos eliminados** en ~15 archivos (src/lib/*, src/app/api/**/route.ts) — se conservan solo decisiones arquitectónicas, reglas de negocio no evidentes y advertencias técnicas

### Centralización de Lógica Duplicada
- **Nuevo módulo**: src/lib/period.ts — utilidad centralizada para manejo de períodos académicos
- **Funciones exportadas**: getCurrentPeriod(), parsePeriod(), getNextPeriod(), getPreviousPeriod(), getSemesterFromPeriod(), getYearFromPeriod(), isCurrentPeriod()\r
- **7 ocurrencias duplicadas eliminadas** de getMonth() < 6 / getCurrentPeriod() en:
  - src/lib/missionVerification.ts\r
  - src/app/api/student/route.ts\r
  - src/app/api/curriculum/route.ts\r
  - src/app/api/stats/route.ts\r
  - src/application/rewards/rewardFactory.ts\r
  - src/domain/rewards/rewardRules.ts\r
  - src/lib/recommendations.ts\r

### Validación Post-Limpieza
| Comando | Resultado |
|---------|-----------|
| npm run lint | ✅ PASS (0 errors, 0 warnings) |
| npm run build | ✅ PASS (29 páginas generadas) |
| npm run test:unit | ✅ PASS (25 tests) |
| npm run prisma validate | ✅ PASS (schema válido) |

---

## Modelo de Base de Datos (24)

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
| `UNIVERSITY_API_ENABLED="true"` | `HttpBadgeSource` | Catálogo de la universidad vía `GET /academic/students/:code/badges` |

La API externa es la única fuente de insignias. Si no responde, la ruta informa
un error de disponibilidad; no se mezclan ni se sustituyen datos con un catálogo
local. Un 404 externo (el estudiante no está registrado allá) devuelve catálogo
vacío porque es un dato faltante, no una caída del servicio.

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
