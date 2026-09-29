# Backend — `src/app/api`

API privada de UTB Gamificación construida con Next.js App Router (Route Handlers `route.ts`). Autentica con NextAuth, autoriza por rol y persiste en PostgreSQL vía Prisma. Lógica de dominio en `src/lib/*`. 

## Estructura

```text
src/app/api/
  auth/[...nextauth]/route.ts  # NextAuth (login/logout/sesión)
  auth/request-code/route.ts   # POST {email} OTP al buzón @utb.edu.co (rate-limit 5/h)
  auth/verify-code/route.ts    # POST {email,code,name,password,studentCode?} JIT STUDENT
  admin/teachers/route.ts      # POST alta docente solo ADMIN (sin auto-registro TEACHER)
  student/route.ts              # GET perfil + stats + racha + insignias recientes
  curriculum/route.ts           # GET malla con estados | POST selección de cursos
  stats/route.ts                # GET agregados académicos + gamificación
  missions/route.ts             # GET disponibles+estado | POST avance/evidencia
  rewards/route.ts              # GET catálogo+puntos+canjes | POST solicitar canje
  badges/route.ts               # GET catálogo de insignias + origin para tarjetas base/Plus
  notifications/route.ts        # GET listar | PATCH marcar leída | DELETE borrar
  recommendations/route.ts      # GET generar bajo demanda | PATCH aceptar/descartar
  search/route.ts               # GET ?q= búsqueda global sin tildes
  teacher/route.ts              # GET acompañamiento | PATCH revisar misión
  teacher/rewards/route.ts      # GET canjes de mis cursos | PATCH aprobar/rechazar
  teacher/notify/route.ts       # POST enviar ruta recomendada

src/lib/ (dominio usado por las rutas)
  auth.ts            # NextAuth Credentials (@utb.edu.co estricto + bcrypt), auth()
  institutionalEmail.ts # normalize/parse correo-ciudadano (código vs nominal), password/code validators
  emailProvider.ts   # OTP: Resend | SMTP log | console-dev (sin exponer código en prod)
  rateLimit.ts       # in-memory 5/h OTP, 10/h verify (migrar a Redis en multi-instancia)
  session.ts         # getSessionContext, requireRole, jsonUnauthorized/Forbidden
  prisma.ts          # Singleton PrismaClient + PrismaPg(DATABASE_URL)
  academic.ts        # getAverageGrade, getCurrentSemester, getCreditLimit
  recommendations.ts # generateRecommendations()
  streak.ts          # calculateStreak(activities)
  activity.ts        # recordDailyAcademicActivity, recordUserActivity, ACTIVITY_ACTIONS
  missionRules.ts    # computeConsecutiveAccessStreak, countUniqueCompletedMissions (+ tests)
  missionVerification.ts # verifyMission(autoVerify por verificationKey/Value)
  badgeSource.ts      # BadgeSource, BadgeRecord, BadgeCatalog (contrato de insignias)
  prismaBadgeSource.ts # Catalogo local: Badge + StudentBadge
  httpBadgeSource.ts   # Catalogo institucional: GET /academic/students/:code/badges
  getBadgeSource.ts    # Factory + isExternalBadgesEnabled + isExternalStudentNotFound
  academicSource.ts  # Interfaz AcademicSource + tipos (malla, estudiante, programa)
  getAcademicSource.ts # Factory: Prisma o HTTP según UNIVERSITY_API_ENABLED
  prismaAcademicSource.ts # Origen académico sobre Prisma (comportamiento previo)
  httpAcademicSource.ts   # Origen académico sobre la API externa (:3001)

utb-external-api/    # Servicio Fastify mock que simula la API de la universidad
                     #   /academic/students/:code/{enrollments,history,badges}
                     #   /academic/badges → catálogo de insignias
                     #   fixtures/badges.json = catálogo y estado por estudiante

src/middleware.ts    # Guard de páginas: sin cookie authjs.session-token -> /login
prisma/schema.prisma # 22 modelos (fuente de verdad de tablas/enums)
```

## Funcionamiento (flujo de una petición)

1. `middleware.ts` deja pasar `/login`, `/api/auth/*` y estáticos; sin cookie de sesión redirige páginas a `/login`. Las APIs no dependen solo de esto.
2. Cada `route.ts` llama a `auth()` o `requireRole("STUDENT"|"TEACHER")` (`src/lib/session.ts`):
   - sin sesión → `401 { error: "No autorizado" }`
   - rol distinto → `403 { error }`
3. Valida el body/query, calcula el periodo actual (`YYYY-1` ene-jun, `YYYY-2` jul-dic) cuando filtra `Enrollment.semesterCode` o `TeacherCourse.period`.
4. Llama a `src/lib/*` para reglas (promedios, racha, verificación, recomendaciones) y a `prisma` para leer/escribir.
5. Registra actividad en `Activity` cuando cuenta para racha o auditoría (`ACADEMIC_DAILY_ACTIVITY`, `RUTA_RECOMENDADA_DOCENTE`, vistas).
6. Responde JSON. Errores: `400` entrada inválida, `401/403` auth, `404` no encontrado.

Convención: `GET` nunca muta salvo registrar actividad diaria idempotente (`/api/student`); `POST` crea/avanza, `PATCH` actualiza estado, `DELETE` borra.

## Endpoints

### Auth — `auth/[...nextauth]/route.ts`
- `GET/POST`: handlers de NextAuth. `authorize` solo acepta `@utb.edu.co` con regex exacta + `bcrypt.compare`. Sesión JWT con `{ id, role }`.

### Registro institucional — `auth/request-code` + `auth/verify-code`
- `POST request-code { email }`: normaliza, rate-limit, verifica no registrado, invalida OTPs previos, crea `EmailVerificationToken` (SHA-256, 15 min) y envía vía `emailProvider`.
- `POST verify-code { email, code, name, password, studentCode? }`: valida OTP (5 intentos, un solo uso), resuelve `studentCode/programId/admissionYear` por prioridad `AllowedStudent > parse(email) > studentCode manual`, crea `User(STUDENT)+StudentProfile` en transacción + notificación.
- `POST admin/teachers` (ADMIN): única alta docente. Requiere `ADMIN_EMAIL` bootstrap vía seed/env.

### Estudiante

**`student/route.ts` (STUDENT)**
- `GET`: usuario + `studentProfile(program, enrollments)` + `totalPoints` + nivel + `recentBadges` + `streak`. Si hoy no hay `ACADEMIC_DAILY_ACTIVITY`, la crea. El perfil y las inscripciones se leen vía `getAcademicSource()`.

**`curriculum/route.ts` (STUDENT)**
- `GET`: programa + semestres + cursos con `prerequisites`, cruza `Enrollment` para estado `APROBADO/EN_CURSO/BLOQUEADO/DISPONIBLE`, calcula créditos y `getCreditLimit/getCurrentSemester`. Lee la malla vía `getAcademicSource()`.
- `POST { courseIds[] }`: guarda selección del periodo actual.
- Con `UNIVERSITY_API_ENABLED=true`, ambas lectura de datos académicos pasan por `HttpAcademicSource`; si la API externa no responde, devuelven `503 {error:"Fuente académica externa no disponible"}` en lugar de `500`.

**`stats/route.ts` (STUDENT)**
- `GET`: `{ overall: { creditsApproved, totalCredits, averageGrade, coursesCompleted, currentSemester }, bySemester[], gamification: { points, level } }`.

**`missions/route.ts` (STUDENT)**
- `GET`: `Mission.isActive + requiredLevel <= profile.level` con `StudentMission` del usuario.
- `POST { missionId, evidence? }`: crea/avanza `StudentMission(progress, status)`. Si `mission.autoVerify`, `verifyMission()` decide `COMPLETADA` (y otorga `Point`) o deja `EN_REVISION` para el docente.

**`rewards/route.ts` (STUDENT)**
- `GET`: `{ totalPoints, rewards(isActive), studentRewards, enrolledCourses(periodo actual) }`.
- `POST { rewardId, courseId }`: valida puntos (`cost`), `maxUses`, que el curso sea del periodo; crea `StudentReward{SOLICITADO, pointsSpent}`.

**`badges/route.ts` (autenticado)**
- `GET`: resuelve el `studentCode` del usuario y pide el catálogo a `getBadgeSource()`. Respuesta: `{ badges[], stats{total,earned,percentage,byCategory}, origin{source,catalogVersion,degraded} }`. Cada badge sale con `id, name, description, icon, category, requiredLevel, pointsRequired, earned, earnedAt, evidence`.
- Con `UNIVERSITY_API_ENABLED=true` el catálogo viene de la API institucional; si esa no responde **degrada al local** y marca `origin.degraded=true` (a diferencia de `curriculum`/`student`, que cortan con 503). Un 404 externo (estudiante no registrado allá) devuelve catálogo vacío sin degradar.
- `origin.source` permite auditar de dónde salió la respuesta; la UI lo muestra como chip en `/logros`.

**`notifications/route.ts` (STUDENT/TEACHER)**
- `GET`: propias ordenadas por fecha. `PATCH { id, isRead }`. `DELETE ?id=`.

**`recommendations/route.ts` (STUDENT)**
- `GET`: `generateRecommendations(studentId)` (cuello de botella, reprobadas, promedio <3.5, ruta, electivas, créditos).
- `PATCH { id, isAccepted?, isRead? }`.

**`search/route.ts` (autenticado)**
- `GET ?q=`: normaliza tildes/minúsculas y busca en cursos, misiones y badges.

### Docente

**`teacher/route.ts` (TEACHER)**
- `GET`: `TeacherCourse(periodo actual)` + por estudiante: promedio, créditos, racha (`calculateStreak`), insignias, riesgo.
- `PATCH { studentMissionId, approve: boolean, reviewComment? }`: `VERIFICADA (+Point MISION_COMPLETADA)` o `RECHAZADA`.

**`teacher/rewards/route.ts` (TEACHER)**
- `GET`: solicitudes `StudentReward` de sus cursos + historial.
- `PATCH { studentRewardId, approve: boolean, reviewNote? }`: `APROBADO/RECHAZADO` + `recordUserActivity`.

**`teacher/notify/route.ts` (TEACHER)**
- `POST { studentId, message, courses? }`: crea `Notification` al estudiante y `Activity{RUTA_RECOMENDADA_DOCENTE}`.

## Reglas clave en `src/lib`

- `academic.ts`: promedio ponderado por créditos, semestre actual por `semesterCode`, tope de créditos por semestre.
- `streak.ts` + `activity.ts`: racha diaria por `Activity.createdAt` continua (`current/best/activeToday`).
- `missionVerification.ts`: interpreta `verificationKey` (`APROBAR_CREDITOS_SEMESTRE`, `MEJORA_PROMEDIO`, `RACHA_*`, curso concreto...) con `verificationValue`.
- `getBadgeSource.ts`: resuelve el origen del catálogo de insignias. `HttpBadgeSource` **lanza** `ExternalApiUnavailableError` en vez de devolver `null` (a diferencia de `httpAcademicSource`): así la ruta no puede confundir "caída" con "catálogo vacío" y degrada explícitamente a `PrismaBadgeSource`.
- Tests: `npm run test:unit` (`academic.test.ts`, `missionRules.test.ts`).

## Cómo añadir un endpoint

1. Crear `src/app/api/<recurso>/route.ts` con `export async function GET/POST/PATCH/DELETE()`.
2. Autorizar primero: `const s = await requireRole("STUDENT")` (o `TEACHER`); responder `401/403` si `s.error`.
3. Validar entrada y usar `prisma` + `src/lib/*` (no SQL crudo).
4. Responder `NextResponse.json(...)` con códigos correctos.
5. Si cuenta para racha/auditoría, llamar `recordUserActivity/recordDailyAcademicActivity`.
6. Actualizar este README + el catálogo del `README.md` raíz.
