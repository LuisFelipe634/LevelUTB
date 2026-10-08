# LevelUTB

Plataforma gamificada para el seguimiento del avance académico de estudiantes de la Universidad Tecnológica de Bolívar.

---

## Descripción

Sistema web donde el estudiante visualiza su progreso en la malla curricular, gana puntos e insignias, canjea recompensas académicas por puntos y recibe recomendaciones personalizadas. El docente acompaña a sus estudiantes por curso, verifica misiones con evidencia, aprueba canjes de recompensas y envía rutas recomendadas.

> **Prototipo**: el acceso es solo con las dos cuentas de demostración que crea
> el seed. No hay alta de cuentas ni registro de estudiantes, así que un correo
> institucional real todavía no permite iniciar sesión.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16.3.2 (App Router, `src/app`) |
| UI | React 19, Tailwind CSS 4 (`src/app/globals.css`, `postcss.config.mjs`) |
| Base de datos | PostgreSQL |
| ORM | Prisma 7.9.1 (`prisma/schema.prisma`, `prisma.config.ts`, `src/lib/prisma.ts` con `@prisma/adapter-pg`) |
| Autenticación | NextAuth.js 5 beta (JWT + Credentials, `src/lib/auth.ts`) |
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
  |-- NextAuth: login con correo y contrasena, dominio validado + bcrypt (src/lib/auth.ts)
  `-- /api/*: endpoints por rol STUDENT / TEACHER
       |
       v
  src/lib/* (academic, recommendations, streak, activity, missionVerification)
        |
        v
  Prisma Client (src/lib/prisma.ts) -> PostgreSQL (25 modelos)
```

### Capas del backend

| Capa | Ubicación | Responsabilidad |
|---|---|---|
| Guard global | `src/middleware.ts` | Deja pasar `/login`, `/api/auth`, estáticos; si no hay cookie de sesión redirige a `/login?callbackUrl=...`. Cada API además valida JSON. |
| Sesión/roles | `src/lib/auth.ts`, `src/lib/session.ts` | `auth()`, `requireRole("STUDENT"\|"TEACHER")`, `jsonUnauthorized`, `jsonForbidden`. El login valida el dominio institucional, pero solo hay cuentas creadas por el seed. |
| Rutas HTTP | `src/app/api/**/route.ts` | Validan entrada, rol y responden JSON. |
| Aplicación | `src/application/` | Casos de uso + factorías (`missionFactory`, `rewardFactory`) y DTOs. Orquesta dominio e infraestructura. |
| Dominio | `src/domain/` | Reglas puras: `missions/missionRules.ts` + `missionVerificationService.ts`, `rewards/rewardRules.ts`, tipos y puertos (repositorios). |
| Infraestructura | `src/infrastructure/` | Adaptadores Prisma (`prismaMissionRepository`, `prismaRewardRepository`). |
| Soporte | `src/lib/` | `academic.ts` (promedio, semestre actual, tope créditos), `recommendations.ts`, `streak.ts`, `activity.ts` (`ACTIVITY_ACTIONS`, racha diaria), `getBadgeSource.ts` / `getAcademicSource.ts` (origen externo del catálogo y datos académicos), `period.ts` (períodos académicos centralizados), `pointRules.ts` (topes de puntos), `missionUi.ts` (avisos de misión). |
| Persistencia | `src/lib/prisma.ts` | Singleton `PrismaClient` + `PrismaPg`. En dev se reutiliza vía `globalThis`. |
| Modelo | `prisma/schema.prisma` | 25 modelos: usuarios, malla, progreso, gamificación, recompensas, notificaciones, riesgo. |
| Datos | `prisma/seed.ts` | Seed base (programa ISCO 2019, 10 semestres, 55 cursos, 162 créditos, niveles, misiones, recompensas, 1 estudiante y 1 docente enlazados por `C09A`). |

### Catálogo de APIs

| Endpoint | Métodos | Rol | Función |
|---|---|---|---|
| `/api/auth/[...nextauth]` | GET, POST | público | Login/logout NextAuth Credentials. No hay endpoint de alta de cuentas. |
| `/api/curriculum` | GET | STUDENT | GET malla por semestre con estado (aprobado/en curso/bloqueado/disponible), prerrequisitos y créditos. |
| `/api/stats` | GET | STUDENT | Lee la malla y el historial por la fuente académica externa (`getAcademicSource()`) y el resto desde PostgreSQL: créditos aprobados/totales, promedio (`academic.ts`), avance por semestre y categoría, puntos/nivel, tendencia e insignias obtenidas. |
| `/api/missions` | GET, POST | STUDENT | GET disponibles (por `level`) + estado del estudiante. POST crear/avanzar con `evidence`; si `autoVerify` usa `domain/missionVerificationService.ts` (vía `prismaMissionRepository`), si no queda `EN_REVISION`. El catálogo actual son 13 misiones de onboarding (`PLANIFICACION`/`ACADEMICO`), todas `autoVerify` sin `verificationKey`. |
| `/api/rewards` | GET, POST | STUDENT | GET catálogo activo + puntos totales + canjes + cursos del periodo actual para elegir `courseId`. POST solicitar canje `{ rewardId, courseId }` (descuenta puntos, estado `SOLICITADO`). |
| `/api/badges` | GET | STUDENT | Catálogo de insignias para el panel de tarjetas base y Plus. El origen se resuelve con `getBadgeSource()` y la respuesta incluye `origin{source, catalogVersion, degraded}`. |
| `/api/notifications` | GET, PATCH, DELETE | ambos | Listar, marcar leída (`isRead`), borrar. Tipos: `INFO, WARNING, ALERTA_RIESGO, LOGRO_OBTENIDO, MISION_DISPONIBLE, RECORDATORIO, SOLICITUD_RECOMPENSA`. |
| `/api/recommendations` | GET, PATCH | STUDENT | GET genera bajo demanda con `generateRecommendations()`. PATCH aceptar/descartar (`isAccepted`, `isRead`). |
| `/api/teacher` | GET, PATCH | TEACHER | GET el curso demo asignado (`C09A`, vía `TeacherCourse` por `periodo YYYY-1/2`) + estudiantes con promedio/créditos/racha/riesgo e insignias con contador de progreso. PATCH revisar misión (aprobar/devolver con `reviewComment`, otorga puntos). |
| `/api/teacher/rewards` | GET, PATCH | TEACHER | GET solicitudes de canje de sus cursos + historial. PATCH aprobar/rechazar (`APROBADO/RECHAZADO`, `reviewNote`). |
| `/api/teacher/notify` | POST | TEACHER | `{ studentId, message/cursos }` envía notificación de ruta recomendada y guarda `Activity{RUTA_RECOMENDADA_DOCENTE}`. |

Errores estándar: `401 { error: "No autorizado" }` sin sesión, `403` rol incorrecto, `404` perfil/recurso no encontrado.

Detalle de flujos, secuencias de runtime y decisiones: ver `docs/arc42.md`, secciones 6 y 9.

---

## Funcionalidades

### Estudiantes (`/dashboard`, `/malla`, `/misiones`, `/logros`, `/recompensas`, `/estadisticas`, `/notificaciones`, `/perfil`)

- **Dashboard**: puntos, nivel, racha, misiones activas, insignias recientes, notificaciones y alertas.
- **Malla interactiva**: por semestre con estado por prerrequisitos y créditos aprobados vs totales. Es de solo lectura: la selección de materias del periodo no está implementada.
- **Misiones**: tipos `ACADEMICO, PLANIFICACION, MEJORA_CONTINUA, HABITO_ESTUDIO, IMPACTO_SOCIAL`. El catálogo actual trae 13 misiones de onboarding (`PLANIFICACION`/`ACADEMICO`, todas `autoVerify`); las manuales con evidencia quedan `EN_REVISION` para el docente y el motor de verificación vive en `src/domain/missions/missionVerificationService.ts`. Estados: `PENDIENTE → EN_PROGRESO → EN_REVISION → COMPLETADA/VERIFICADA/RECHAZADA`.
- **Insignias**: panel visual con tarjetas de Core Skills, Power Skills, Líderes UTB y Conexiones Profesionales, incluyendo sus variantes Plus. El catálogo se sirve desde la API externa.
- **Recompensas**: canje de puntos por bonificaciones (`EXAMEN, ASISTENCIA, ENTREGA, OTRO`) atadas a un `courseId` del periodo actual. Flujo `SOLICITADO → APROBADO/RECHAZADO → USADO/EXPIRADO`. Página `/recompensas`.
- **Recomendaciones**: cuello de botella, reprobadas, electivas, ruta del próximo semestre, promedio < 3.5, rellenar créditos.
- **Estadísticas**: créditos, promedio, nivel, tendencia y distribución por semestre.
- **Perfil**: datos académicos, nivel e insignias recientes.
- **Responsive + modo claro/oscuro** (`next-themes`, `AppShell` + `Sidebar`/`Header`).

### Docentes (`/docentes`, `/docentes/insignias`, `/perfil-docente`)

- **Acompañamiento**: el curso asignado del periodo (`C09A`) como bloque interactivo + estudiantes inscritos en él (promedio, créditos, racha, insignias, riesgo).
- **Insignias del curso**: `/docentes/insignias` resume las cuatro categorías y sus variantes Plus. Al expandir un estudiante se muestra cada insignia con el color de su categoría y un contador sencillo `1/1`.
- **Verificación de misiones**: aprobar/devolver con comentario (otorga `Point{MISION_COMPLETADA}`).
- **Recompensas**: aprobar/rechazar canjes de sus cursos.
- **Enviar ruta recomendada**: notificación al estudiante + registro en `Activity`.
- **Perfil docente**: facultad, departamento, profesión, cargo, conteo de estudiantes y misiones pendientes.

---

## Sistema de Gamificación

### Puntos (`Point.source`)

`PUNTOS_BASE_SEMESTRAL, MISION_COMPLETADA, RENDIMIENTO_ACADEMICO, MEJORA_PROMEDIO, CONSISTENCIA, IMPACTO_SOCIAL, EVENTO_ESPECIAL, CANJE_RECOMPENSA, REVERSO_CANJE, AJUSTE_ACADEMICO`. Los movimientos de misión usan `referenceKey` idempotente (`MISSION:{userId}:{missionId}:{periodo}`) y `periodCode` (`AcademicPeriod`, estados `FUTURE/ACTIVE/EN_CIERRE/CLOSED`).

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

Catálogo canónico `scripts/badges.json` v2026.3 (8 insignias): Core Skills, Power Skills, Líderes UTB y Conexiones Profesionales, cada una con variante Plus. Categorías: `PROGRESO, COMPETENCIA, HABITO, IMPACTO_SOCIAL` (el enum incluye además `RENDIMIENTO`). Fuente única sincronizable con `npm run db:sync-badge-fixtures` hacia `utb-external-api/src/fixtures/badges.json`.

### Misiones (`Mission.type`)

`ACADEMICO, PLANIFICACION, MEJORA_CONTINUA, HABITO_ESTUDIO, IMPACTO_SOCIAL`.

### Recompensas (`Reward.category`)

`EXAMEN (exonerar/mejorar nota), ASISTENCIA (limpiar falta), ENTREGA (extender/reintentar), OTRO`. Campos: `cost` en puntos, `maxUses`, `isActive`.

### Recomendaciones

Motor `src/lib/recommendations.ts`: prerrequisitos que más desbloquean (alta), reprobadas (alta), promedio bajo (alta), ruta siguiente semestre (media), electivas desbloqueadas (baja), rellenar créditos.

### Riesgo (`RiskAlert`)

`PREREQUISITO_FALTANTE, ATRASO_CREDITOS, BAJO_PROMEDIO, CURSO_EN_RIESGO, SEMESTRE_RETRASADO` con severidad `BAJA/MEDIA/ALTA/CRITICA`.

---

## Cómo funciona el sistema de misiones, puntos y recompensas

### La idea general

El sistema convierte el avance académico en un juego con tres piezas que se alimentan entre sí: las **misiones** son lo que el estudiante hace, los **puntos** son la recompensa y las **recompensas** son en qué se gastan esos puntos. Todo gira alrededor del periodo académico vigente (por ejemplo `2026-2`): puntos y topes se calculan por periodo para que cada semestre empiece con reglas claras.

### Las misiones: dos formas de ganar

Hay 13 misiones de onboarding (recorrer el dashboard, conocer la malla, planificar el semestre…). Todas son **automáticas**: al completarlas, el sistema las aprueba solo y entrega los puntos al instante, sin intervención humana.

El sistema también soporta misiones **manuales** para el futuro: el estudiante adjunta evidencia, la misión queda *en revisión* y un docente la aprueba o la devuelve con un comentario. Solo lo aprobado por el docente entrega puntos. Hoy el catálogo no trae de estas, pero el mecanismo ya existe (estados `PENDIENTE → EN_PROGRESO → EN_REVISION → COMPLETADA/VERIFICADA/RECHAZADA`).

### Los puntos: justos y sin trampa

Cada punto guarda *de dónde vino* (`MISION_COMPLETADA`, `PUNTOS_BASE_SEMESTRAL`, `CANJE_RECOMPENSA`…). Los de misión llevan además una **llave única por estudiante, misión y periodo**: si el estudiante reintenta o hay un error de red, el sistema detecta la llave repetida y no duplica puntos.

Para que nadie acumule todo de una vez, hay **topes**: 300 puntos de misión por semana y 1500 por periodo. Pasado el tope, el sistema simplemente no otorga más hasta el siguiente ciclo.

Además de las misiones, al cerrar cada semestre el estudiante recibe **puntos base (100) más 20 por cada crédito aprobado** (tope 300). El **nivel** (Novato → Leyenda) no se guarda: se recalcula en cada consulta a partir de los puntos reales, así que perfil, dashboard y estadísticas siempre muestran lo mismo sin riesgo de desincronización.

### Las recompensas: gastar puntos con respaldo docente

Las recompensas son beneficios académicos reales (exonerar un parcial, extender una entrega, limpiar una falta) que se compran con puntos. Funcionan así:

1. El estudiante elige una recompensa y el **curso donde quiere usarla** (debe ser del periodo actual).
2. El sistema valida que tenga puntos suficientes, que no supere el límite de usos y que no tenga ya una solicitud pendiente igual; luego **descuenta los puntos de inmediato** y deja la solicitud *pendiente*.
3. Un docente de ese curso la **aprueba o la rechaza**: si la aprueba, el beneficio queda activo (con fecha de vencimiento, 30 días); si la rechaza, **los puntos se devuelven automáticamente**.

### El catálogo: quién manda

Hay una sola lista oficial de misiones e insignias. El seed la crea desde cero (borrando todo) y los comandos `db:sync-missions` / `db:sync-badges` la actualizan sin borrar el progreso: crean lo nuevo, actualizan lo cambiado y **eliminan lo obsoleto**. Así el catálogo puede evolucionar sin romper los puntos e insignias que los estudiantes ya ganaron.

---

## Estructura del Proyecto

```text
LevelUTB/
  .env / .env.example        # DATABASE_URL, NEXTAUTH_SECRET/URL (ver Instalación)
  next.config.ts / tsconfig.json / eslint.config.mjs / postcss.config.mjs / prisma.config.ts
  public/utblogotipo.png
  scripts/                   # import-proa.ts, sync-missions.ts, sync-badges.ts, badges.json (catálogo canónico v2026.3)
  prisma/
    schema.prisma            # 25 modelos
    migrations/              # Migraciones SQL
    seed.ts                  # Seed base: ISCO 2019 + 13 misiones onboarding + 8 insignias + 1 estudiante y 1 docente
    seed-if-empty.ts         # Seed condicional (solo si users está vacía)
  src/
    middleware.ts            # Guard de páginas -> /login
    app/
      layout.tsx / globals.css / page.tsx (-> /dashboard) / favicon.ico
      login/ dashboard/ malla/ misiones/ logros/ recompensas/
      estadisticas/ notificaciones/ perfil/ docentes/ docentes/insignias/ perfil-docente/
      api/                   # Backend (ver docs/arc42.md, sección 5)
    application/             # Casos de uso y factorías (missions, rewards, academic)
    domain/                  # Reglas puras (missions, rewards) + tests unitarios
    infrastructure/          # Adaptadores Prisma (missions, rewards)
    components/
      layout/AppShell.tsx    # Oculta Sidebar/Header en /login
      layout/Sidebar.tsx / layout/Header.tsx  # Navegación por rol, logo y acciones
      providers/SessionProvider.tsx / providers/ThemeProvider.tsx
    lib/
      auth.ts / session.ts / prisma.ts
      academic.ts (+ academic.test.ts, academicAverage.test.ts)
      recommendations.ts / streak.ts / activity.ts
      pointRules.ts (+ pointRules.test.ts) # Topes de puntos por misión
      missionUi.ts (+ missionUi.test.ts) # Avisos de misión para la UI
      badgeSource.ts / getBadgeSource.ts # Origen del catálogo de insignias
      academicSource.ts / getAcademicSource.ts / httpAcademicSource.ts # Fuente académica efectiva (externa vs Prisma)
      period.ts (+ period.test.ts) # Utilidad centralizada de períodos académicos
  utb-external-api/        # API académica simulada (fixtures: seed.json académico, badges.json)
```

Estructura detallada: `docs/arc42.md` (5 vista de bloques, 7 despliegue).

---

## Instalación

### Instalación recomendada: Docker Desktop

Docker es el único método soportado para preparar el proyecto de forma igual en
Windows, macOS y Linux. No necesitas instalar Node.js, npm ni PostgreSQL en el
equipo anfitrión.

#### 1. Requisitos previos (instalar ANTES de empezar)

No necesitas Node.js, npm ni PostgreSQL: los contenedores ya los traen.
`./setup.sh` verifica todo esto automáticamente y te dice qué falta.

| Requisito | Para qué | Cómo verificar |
|---|---|---|
| Docker Desktop (incluye Engine + plugin Compose v2) | Construir y correr `db`, `external-academic-api` y `app` | `docker --version` y `docker compose version` |
| Motor Docker en ejecución | Sin el motor, ningún contenedor arranca | Abre Docker Desktop y espera a que diga "Engine running"; o `docker info` |
| Git | Clonar el repo (en Windows además trae Git Bash) | `git --version` |
| Bash + `curl` + `openssl` (o `python3`) | Ejecutar `./setup.sh` y generar secretos del `.env` | Ya vienen con Git Bash (Windows) y con macOS/Linux. Verifica con `bash --version`, `curl --version`, `openssl version` |
| Puertos libres `3000`, `3001` y `5432` | App, API académica y PostgreSQL | Si otro programa los ocupa, detenlo antes de instalar |

Notas por sistema:
- **Windows:** instala Git desde <https://git-scm.com/downloads> (incluye Git Bash) y Docker Desktop desde <https://www.docker.com/products/docker-desktop/> con el backend WSL 2 activado. Ejecuta `./setup.sh` desde **Git Bash**, no desde PowerShell.
- **macOS / Linux:** instala Docker Desktop (o Engine + Compose) y Git con tu gestor de paquetes. Ejecuta `./setup.sh` desde tu terminal habitual.

#### 2. Descargar el proyecto

```bash
git clone https://github.com/LuisFelipe634/LevelUTB.git
cd LevelUTB
```

#### 3. Instalación automática

Desde la raíz del proyecto (en Windows, desde **Git Bash**) ejecuta:

```bash
./setup.sh
```

Esto hace todo por ti, sin editar nada a mano:

1. Verifica Docker, el plugin Compose y que el motor esté en ejecución.
2. Crea `.env` desde `.env.example` si no existe (nunca sobrescribe el tuyo).
3. Genera `NEXTAUTH_SECRET` y `POSTGRES_PASSWORD` automáticamente si aún
   tienen el valor placeholder.
4. Levanta los servicios con `docker compose up --build -d`.
5. Espera a que PostgreSQL, la API académica y la app estén listas.
6. Muestra el estado final, las URLs y las credenciales demo.

Opciones útiles:

```bash
./setup.sh --yes --reset   # Reinstalación limpia (borra el volumen pgdata)
./setup.sh --reseed         # Reinstala y regenera los datos demo (destructivo)
./setup.sh --no-build       # Levanta sin reconstruir imágenes
./setup.sh --help           # Ver todas las opciones (incluye modo --local sin Docker)
```

> Si NO usas `./setup.sh`, hazlo manual: `cp .env.example .env`
> (en PowerShell: `Copy-Item .env.example .env`), genera un `NEXTAUTH_SECRET`
> de mínimo 32 caracteres y una clave en `POSTGRES_PASSWORD`, y luego
> `docker compose up --build -d`. Dentro de Docker, la app reescribe
> `DATABASE_URL` a `@db` y `UNIVERSITY_API_URL` al servicio interno
> automáticamente; los valores de tu `.env` aplican al modo local.

#### 4. Qué hace el arranque

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

Debes ver los tres servicios en ejecución, `healthy` en `db` y mensajes de
`listening`/`Ready` en los logs. Abre <http://localhost:3000> y entra con
una credencial de prueba (`./setup.sh` ya muestra este resumen al terminar).

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

Equivalente automático (reinstala y resiembra en un solo paso):

```bash
./setup.sh --reseed --yes
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

Equivalente automático:

```bash
./setup.sh --reset --yes
```

#### 9. Detener el proyecto

```bash
docker compose down
```

Este comando detiene los contenedores y conserva el volumen de datos.

---

## Credenciales de Prueba (`npm run db:seed` → `prisma/seed.ts`)

Estas son las únicas cuentas que existen en el sistema.

El seed crea **un solo estudiante y un solo docente**, enlazados por una única
materia: `C09A Comunicaciones y Redes`. El estudiante está `CURSANDO` en esa
materia en el periodo vigente y el docente la tiene asignada, así que cualquier
canje de recompensa del estudiante le aparece al docente en `/docentes` para
revisar. Ambas cuentas usan la contraseña `demo123`.

El email debe pertenecer al dominio institucional (validado en `src/lib/auth.ts`).

> **Estas son las únicas cuentas que existen.** El prototipo no tiene alta de
> cuentas ni registro de estudiantes: un correo institucional real no sirve para
> iniciar sesión hasta que exista ese flujo.

| Rol | Email | Contraseña | Nombre / uso |
|---|---|---|---|
| STUDENT | demo@utb.edu.co | demo123 | Juan Pérez (`2019123456`) — 6to semestre, 79 créditos, promedio 4.2, nivel 3, 2000 puntos en el periodo. Matriculado en `C09A`. |
| TEACHER | docente@utb.edu.co | demo123 | María González — Ingeniería de Sistemas, Facultad de Ingeniería. Asignada `C09A` en el periodo vigente. |

Datos que quedan sembrados para el estudiante: historia de los semestres 1-5 en
`APROBADO` y semestre 6 en `CURSANDO`, 5 de las 8 insignias del catálogo obtenidas
y un saldo inicial de 2000 puntos (`PUNTOS_BASE_SEMESTRAL`) en el periodo
vigente, para poder canjear recompensas sin esperar al cierre de un periodo.

## Comandos Disponibles

```bash
./setup.sh                 # Instalación automática completa (recomendado)
./setup.sh --yes --reset   # Reinstalación limpia (borra el volumen pgdata)
./setup.sh --reseed --yes  # Reinstala y regenera los datos demo
docker compose up --build -d  # Construye y levanta todos los servicios (manual)
docker compose ps              # Comprueba el estado de los contenedores
docker compose logs --tail=50  # Consulta los logs de todos los servicios
docker compose restart         # Reinicia sin eliminar datos
docker compose down            # Detiene los servicios y conserva datos
docker compose down -v         # Detiene y elimina el volumen PostgreSQL

docker compose exec app npm run db:seed          # Seed destructivo
docker compose exec app npm run db:seed-if-empty # Seed no destructivo
docker compose exec app npm run db:sync-missions # Sincroniza las 13 misiones (con purga de obsoletas)
docker compose exec app npm run db:sync-badges   # Sincroniza las 8 insignias (con purga de obsoletas)
docker compose exec app npm run lint              # Lint dentro del contenedor
npm run db:sync-badge-fixtures # Copia scripts/badges.json a utb-external-api (requiere rebuild)
npm run test:unit              # Tests unitarios (dominio + lib)
```

---

## Modelo de Base de Datos (25)

### Usuarios y auth

- **User**: email institucional único, nombre, `passwordHash` (bcrypt), rol `STUDENT/TEACHER/ADMIN`. Hoy solo lo crea el seed.
- **StudentProfile**: `studentCode`, `programId`, `currentSemester`, `totalCredits`, `averageGrade`, `level`.
- **TeacherProfile**: departamento, facultad, profesión, cargo, `isActive`.

### Académico

- **Program**: ej. ISCO `Ingeniería de Sistemas`, 162 créditos, 10 semestres, versión `2019`.
- **Semester / Course / Prerequisite**: cursos por semestre, tipo `OBLIGATORIO/ELECTIVA/LIBRE_ELECCION/GENERAL`, prerrequisito `REQUIRED/COREQUISITE`.
- **Enrollment**: `{ studentId, courseId, semesterCode YYYY-1/2 }` único, estado `INSCRITO/CURSANDO/APROBADO/REPROBADO/RETIRADO/CANCELADO`, `grade`, origen `UNIVERSITY/MANUAL`.
- **AcademicRecord**: historial importado (`courseCode, grade, semester, year, credits`, estado `APROBADO/REPROBADO/EN_CURSO/PENDIENTE`).
- **TeacherCourse**: `{ teacherId, courseId, period }` único.

### Gamificación

- **Point**: `amount + source + description`, `periodCode` (periodo `YYYY-1/2`), `referenceKey` único (idempotencia). Índice `(userId, periodCode)`.
- **AcademicPeriod**: `{ code, startsAt, endsAt, status FUTURE/ACTIVE/EN_CIERRE/CLOSED, closedAt?, processedAt? }`.
- **Mission**: `type, pointsReward, autoVerify + verificationKey/Value, courseId?, requiredLevel?, isActive, start/endDate`.
- **StudentMission**: `status, progress 0-100, evidence, metadata JSON, verifiedBy/At, reviewComment`, único por estudiante+misión.
- **Badge**: `category, iconUrl, requiredLevel?, pointsRequired?`.
- **StudentBadge**: único por estudiante+insignia.
- **Level**: `number, name, minPoints`.

### Recompensas

- **Reward**: `name, icon, category EXAMEN/ASISTENCIA/ENTREGA/OTRO, cost, maxUses?, isActive`.
- **StudentReward**: `{ studentId, rewardId, courseId }` único, `status SOLICITADO/APROBADO/RECHAZADO/EXPIRADO/USADO`, `pointsSpent, requestedAt, reviewedBy/At, reviewNote, evidence, expiresAt`.

### Notificaciones, actividad, recomendaciones, riesgo

- **Notification**: `title, message, type, isRead, link?`.
- **Activity**: `{ action, details Json? }`, acciones en `ACTIVITY_ACTIONS` (`LOGIN, PAGE_VIEW, ACADEMIC_DAILY_ACTIVITY, RUTA_RECOMENDADA_DOCENTE...`) para rachas.
- **Recommendation**: `type CURSO_SUGERIDO/RUTA_ACADEMICA/ALERTA_ATRASO/MEJORA_PROMEDIO/ELECTIVA_RECOMENDADA/RELLENAR_CREDITOS, priority 1=alta 2=media 3=baja, isRead, isAccepted?`.
- **RiskAlert**: `type + severity BAJA/MEDIA/ALTA/CRITICA, courseId?, isResolved?`.

---

## Mejoras Recientes

### Limpieza de Código
- **Dependencias eliminadas**: clsx y tailwind-merge (no utilizadas en el código)
- **Documentación redundante eliminada**: src/app/README.md y src/app/api/README.md (contenido consolidado en README.md y docs/arc42.md)
- **Comentarios narrativos eliminados** en ~15 archivos (src/lib/*, src/app/api/**/route.ts) — se conservan solo decisiones arquitectónicas, reglas de negocio no evidentes y advertencias técnicas

### Centralización de Lógica Duplicada
- **Nuevo módulo**: src/lib/period.ts — utilidad centralizada para manejo de períodos académicos
- **Funciones exportadas**: getCurrentPeriod(), parsePeriod(), getNextPeriod(), getPreviousPeriod(), getSemesterFromPeriod(), getYearFromPeriod(), isCurrentPeriod()
- **Ocurrencias duplicadas eliminadas** de `getMonth() < 6` / `getCurrentPeriod()` en las rutas de `student`, `curriculum`, `stats`, `rewardFactory`, `rewardRules` y `recommendations`, que ahora importan de `src/lib/period.ts`

### Validación
| Comando | Resultado |
|---------|-----------|
| npm run lint | ✅ PASS (0 errores, 0 advertencias) |
| npm run test:unit | ✅ PASS (62 pruebas) |
| npx prisma validate | ✅ PASS (esquema válido) |

### Coherencia académica y limpieza de seeds
- **Seed de insignias unificado**: `prisma/seed.ts` siembra las 8 del catálogo canónico (`scripts/badges.json` v2026.3); `db:sync-badges` purga las fuera de catálogo.
- **`sync-missions.ts` con purga**: `db:sync-missions` elimina misiones obsoletas antes del upsert (evita duplicar 13+13).
- **`/api/stats` con fuente efectiva**: usa la misma fuente académica que perfil/malla (externa si `UNIVERSITY_API_ENABLED="true"`, Prisma como fallback).
- **Datos demo acotados a un flujo**: solo `demo@utb.edu.co` (Juan Pérez, `2019123456`, 79 créditos, promedio 4.2, notas por semestre [4.2, 4.5, 3.9, 4.1, 4.4]) y `docente@utb.edu.co` (María González). El vínculo es `C09A Comunicaciones y Redes`, cursada por el estudiante y asignada al docente en el periodo vigente; el seed falla con error si esa matrícula `CURSANDO` no existe. Se añadieron 2000 puntos iniciales para poder probar el canje de recompensas de punta a punta.
- **Código muerto eliminado**: `src/lib/missionVerification.ts`, `src/lib/missionRules.ts`, `src/lib/rateLimit.ts`, `src/lib/emailProvider.ts` (+ tests) y DTOs sin uso (`missionDTO`, `rewardDTO`).
- **Fix `COMPLETAR_3_MISIONES_SEMANA`**: cuenta `COMPLETADA + VERIFICADA` (antes solo `COMPLETADA`).

---

## Seguridad

- `src/lib/auth.ts` valida el dominio institucional con regex exacta y compara la contraseña con bcrypt; la sesión es un JWT que lleva `id` y `role`. Ojo: hoy no hay alta de cuentas, así que solo pueden entrar los usuarios del seed.
- `src/middleware.ts` protege páginas; cada API revalida con `requireRole` (no confiar solo en el middleware, cuyo `matcher` excluye `/api`).
- Validación de entrada y 401/403/404 JSON en todos los endpoints.
- `.env` no se versiona; `setup.sh` genera los secretos en tiempo de instalación y el `Dockerfile` copia solo directorios de código, sin llaves ni datos de estudiantes.

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
nuevo modelo: cuatro categorías base y cuatro variantes Plus, con parte de ellas
otorgadas al estudiante demo `2019123456`). Es una simulación: cuando exista el
servicio institucional real solo cambia la URL en `UNIVERSITY_API_URL` y el
consumidor no se toca. `BadgeCategory` de la API externa es el mismo enum del
modelo local (`PROGRESO`, `RENDIMIENTO`, `HABITO`, `COMPETENCIA`, `IMPACTO_SOCIAL`),
porque `/logros` filtra por esa taxonomía.

---

## Documentación

| Documento | Contenido |
|---|---|
| [`docs/README.md`](docs/README.md) | Índice de la documentación del proyecto. |
| [`docs/arc42.md`](docs/arc42.md) | Arquitectura en 12 secciones: vistas de bloques y runtime, despliegue, decisiones, riesgos y supuestos abiertos con la institución. |
| [`docs/IA.md`](docs/IA.md) | Declaración de uso de inteligencia artificial. |

---

## Licencia

Proyecto académico - Universidad Tecnológica de Bolívar, asignatura Proyecto de
Ingeniería 2. Ver [`LICENSE`](LICENSE).
