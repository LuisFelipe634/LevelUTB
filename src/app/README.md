# App (frontend) — `src/app`

Frontend con Next.js App Router. Todas las páginas son Client Components (`"use client"`) que consumen la API de `src/app/api/*` con `fetch` y muestran estado con Tailwind + lucide-react. El layout global monta proveedores y el shell con navegación por rol. 

## Estructura

```text
src/app/
  layout.tsx          # <html lang="es"> + Inter + SessionProvider + ThemeProvider + AppShell
  globals.css         # Tailwind 4 + tokens (bg-background, dark:) + scrollbar/transiciones
  page.tsx            # redirect("/dashboard")
  favicon.ico
  login/page.tsx      # signIn credentials, toggle claro/oscuro, redirige por callbackUrl
  dashboard/page.tsx  # Resumen: puntos/nivel/racha/misiones/logros/notificaciones/riesgo
  malla/page.tsx      # Malla por semestre: APROBADO/EN_CURSO/BLOQUEADO/DISPONIBLE + selección
  misiones/page.tsx   # Disponibles/en curso/en revisión/verificadas + evidencia (filtro por tipo)
  logros/page.tsx     # Insignias: progreso, categorías, obtenidas/bloqueadas + chip de origen del catálogo
  recompensas/page.tsx# Catálogo por categoría + puntos + solicitar con courseId + mis canjes
  estadisticas/page.tsx # Créditos/promedio/nivel/tendencia/distribución por semestre
  notificaciones/page.tsx # Centro: filtro leídas/no + marcar/borrar (link a acción)
  perfil/page.tsx     # Header + stats + resumen académico + nivel + insignias recientes
  docentes/page.tsx   # TEACHER: cursos del periodo + estudiantes + revisar misión + ruta + canjes
  perfil-docente/page.tsx # TEACHER: facultad/depto/profesión + acompañados + pendientes

src/components/ (usados por las páginas)
  layout/AppShell.tsx # Oculta Sidebar/Header en /login, layout flex + <main p-6>
  layout/Sidebar.tsx  # Nav por rol (STUDENT: dashboard/malla/misiones/logros/... TEACHER: docentes/...)
  layout/Header.tsx   # Toggle sidebar + búsqueda global (/api/search) + usuario/tema
  providers/SessionProvider.tsx # next-auth/react
  providers/ThemeProvider.tsx   # next-themes (default light, sin sistema)

src/middleware.ts     # Protege páginas: sin cookie -> /login?callbackUrl=<path>
public/utb-logotipo.png # Logo usado en Sidebar/Login
```

## Funcionamiento

1. `layout.tsx` envuelve todo: `SessionProvider > ThemeProvider(defaultTheme="light") > AppShell > page`.
2. `page.tsx` (`/`) redirige a `/dashboard`. `middleware.ts` manda a `/login` si no hay sesión.
3. `AppShell` oculta navegación en rutas públicas (`/login`); resto muestra `Sidebar` (fija `lg:ml-64`, colapsable en móvil) + `Header` + `<main>`.
4. `Sidebar`/`Header` cambian por `session.user.role`: estudiante ve malla/misiones/logros/recompensas/estadísticas/perfil; docente ve docentes/perfil-docente. `Header` consulta `/api/search?q=` con debounce.
5. Cada página: `useEffect fetch("/api/...")` → `Loader2` cargando → error rojo → contenido. Mutaciones con `POST/PATCH` y actualización optimista del `useState`.
6. Estilo: tarjetas `rounded-xl border bg-white dark:bg-gray-800`, acento `blue-600/cyan-500`, insignias `amber`, riesgo `red/amber`, éxito `emerald`. `dark:` en todas las vistas.

## Páginas ↔ API

| Página | API que consume | Acción principal |
|---|---|---|
| `/login` | `POST /api/auth/callback/credentials` (next-auth) | `signIn("credentials", { email @utb.edu.co, password })` |
| `/dashboard` | `/api/student`, `/api/stats`, `/api/missions`, `/api/notifications` | Vista agregada + accesos a malla/misiones |
| `/malla` | `GET/POST /api/curriculum` | Ver estados por prerrequisito, seleccionar cursos del periodo |
| `/misiones` | `GET/POST /api/missions` | Iniciar/avanzar con `evidence`, ver `EN_REVISION` |
| `/logros` | `GET /api/badges` | Ver progreso, filtrar por categoría/estado, ver de dónde salió el catálogo (`origin.source` / `origin.degraded`) |
| `/recompensas` | `GET/POST /api/rewards` | Solicitar `{ rewardId, courseId }`, ver `SOLICITADO/APROBADO/...` |
| `/estadisticas` | `GET /api/stats` | Gráficas/tablas de avance y notas |
| `/notificaciones` | `GET/PATCH/DELETE /api/notifications` | Marcar leídas, seguir `link` |
| `/perfil` | `GET /api/student` | Ver datos académicos, nivel e insignias recientes |
| `/docentes` | `GET/PATCH /api/teacher`, `GET/PATCH /api/teacher/rewards`, `POST /api/teacher/notify` | Revisar misión/canje, enviar ruta |
| `/perfil-docente` | `GET /api/teacher` | Resumen profesional y pendientes |

## Convenciones

- Nuevas páginas: carpeta `src/app/<ruta>/page.tsx` con `"use client"`, fetch a `/api/*`, estados `loading/error/data`, iconos lucide-react.
- Rutas de estudiante en español (`/malla`, `/logros`), de docente (`/docentes`, `/perfil-docente`).
- No llamar a Prisma desde páginas: siempre pasar por `/api`.
- `/malla` y `/perfil` no cambian su contrato aunque cambie el origen de los datos: el backend resuelve con `getAcademicSource()`. Para pasar de Prisma a la API externa basta `UNIVERSITY_API_ENABLED=true` en `.env`; si la API cae, esas rutas responden `503`.
- Proteger la página también en `middleware.ts`/`AppShell` si es privada, además del `requireRole` del API
