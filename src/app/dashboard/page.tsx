"use client"

import { useState, useEffect, useEffectEvent } from "react"
import {
  BookOpen,
  Trophy,
  Target,
  TrendingUp,
  Award,
  AlertTriangle,
  ChevronRight,
  Flame,
  ChevronDown,
  Loader2,
  Lightbulb,
  Send,
  X
} from "lucide-react"
import Link from "next/link"

interface StudentData {
  user: {
    id: string
    email: string
    name: string
    role: string
  }
  profile: {
    studentCode: string
    currentSemester: number
    totalCredits: number
    averageGrade: number
    level: number
    program: {
      name: string
      totalCredits: number
    }
  }
  stats: {
    totalPoints: number
    currentLevel: string
    currentLevelNumber: number
    nextLevel: string | null
    nextLevelPoints: number
    pointsToNextLevel: number
    activeMissionsCount: number
    completedMissionsCount: number
    streak: { current: number; best: number; activeToday: boolean }
    badgesCount: number
  }
  missions: Array<{
    id: string
    title: string
    description: string
    type: string
    points: number
    progress: number
    status: string
    completedAt: string | null
  }>
  recentBadges: Array<{
    id: string
    name: string
    icon: string
    earned: string
  }>
  notifications: Array<{
    id: string
    title: string
    message: string
    type: string
    isRead: boolean
    createdAt: string
  }>
  unreadCount: number
}

interface RecommendationData {
  id: string
  type: string
  title: string
  description: string
  priority: number
  isRead: boolean
}

export default function Dashboard() {
  const [data, setData] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [recommendations, setRecommendations] = useState<RecommendationData[]>([])
  const [showRecommendations, setShowRecommendations] = useState(false)
  const [dismissedUrgentIds, setDismissedUrgentIds] = useState<Set<string>>(new Set())

  const toggleRecommendations = () => setShowRecommendations((prev) => !prev)

  const fetchStudentData = async () => {
    try {
      const response = await fetch("/api/student")
      if (!response.ok) {
        throw new Error("Error al cargar datos")
      }
      const result = await response.json()
      setData(result)

      // Fetch recommendations in parallel
      try {
        const recResponse = await fetch("/api/recommendations")
        if (recResponse.ok) {
          const recs = await recResponse.json()
          setRecommendations(recs)
        }
      } catch {
        // Silently fail — recommendations are non-critical
      }
    } catch (err) {
      setError("Error al cargar los datos del estudiante")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const dismissRecommendation = async (id: string) => {
    setRecommendations((prev) => prev.filter((r) => r.id !== id))
    try {
      await fetch("/api/recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: id }),
      })
    } catch {
      // Silently fail
    }
  }

  const dismissUrgentNotification = async (notificationId: string) => {
    setDismissedUrgentIds((prev) => new Set(prev).add(notificationId))
    // Marcar como leída en backend para que no reaparezca
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, isRead: true }),
      })
      // Actualizar estado local para que desaparezca del listado también
      setData((prev) => prev ? { ...prev, notifications: prev.notifications.map((n) => n.id === notificationId ? { ...n, isRead: true } : n) } : prev)
    } catch {
      // Silently fail
    }
  }

  const loadStudentData = useEffectEvent(fetchStudentData)

  useEffect(() => {
    // The event loads external student data and updates the dashboard state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStudentData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando...</span>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">{error || "No se pudieron cargar los datos"}</p>
          <button
            onClick={fetchStudentData}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  if (!data.profile || !data.profile.program) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">
            Esta vista está disponible únicamente para estudiantes.
          </p>
          <Link
            href="/docentes"
            className="inline-block mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Ir al acompañamiento docente
          </Link>
        </div>
      </div>
    )
  }

  const progressPercentage = Math.round(
    (data.profile.totalCredits / data.profile.program.totalCredits) * 100
  )

  // Filtrar misiones activas
  const activeMissions = data.missions
    .filter((m) => m.status === "EN_PROGRESO" || m.status === "PENDIENTE")
    .slice(0, 3)

  // Notificaciones urgentes de ruta recomendada del docente (recuadro flotante)
  const urgentRouteNotifications = data.notifications.filter(
    (n) => !n.isRead && !dismissedUrgentIds.has(n.id) && n.title.includes("Ruta recomendada")
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
        <div className="grid lg:grid-cols-[220px_1fr]">
          <div className="p-6 sm:p-8 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Trayectoria académica</p><h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">Tu camino hacia la excelencia</h2><p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-gray-400">Cada curso aprobado acerca tu avance a la meta de {data.profile.program.name}.</p></div>
              <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 dark:bg-gray-700 dark:text-gray-200"><span className="h-2 w-2 rounded-full bg-emerald-500" />{progressPercentage}% completado</div>
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-gray-700"><div className="h-full rounded-full bg-blue-600 transition-all duration-700" style={{ width: `${progressPercentage}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs text-slate-500"><span>{data.profile.totalCredits} créditos aprobados</span><span>{data.profile.program.totalCredits} créditos totales</span></div>
          </div>
        </div>
      </section>

{/* Recommendations Section (collapsible, same pattern as semesters in malla) */}
      {recommendations.length > 0 && (
        <div className="bg-linear-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
          <button
            onClick={toggleRecommendations}
            className="w-full flex items-center justify-between p-5 hover:bg-blue-100/60 dark:hover:bg-blue-900/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h2 className="font-semibold text-gray-900 dark:text-white">Recomendaciones para ti</h2>
              <span className="flex items-center gap-1.5 rounded-full bg-blue-100 dark:bg-blue-900/40 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {recommendations.length} activa{recommendations.length > 1 ? "s" : ""}
              </span>
            </div>
            {showRecommendations ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronRight className="w-5 h-5 text-gray-400" />
            )}
          </button>

          {showRecommendations && (
            <div className="px-5 pb-5 space-y-3">
              {recommendations.map((rec) => (
                <div
                  key={rec.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border transition-all ${
                    rec.priority === 1
                      ? "bg-orange-50 dark:bg-orange-900/15 border-orange-200 dark:border-orange-800"
                      : rec.priority === 2
                      ? "bg-white dark:bg-gray-800/60 border-gray-200 dark:border-gray-700"
                      : "bg-green-50 dark:bg-green-900/15 border-green-200 dark:border-green-800"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      {rec.title}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {rec.description}
                    </p>
                  </div>
                  <button
                    onClick={() => dismissRecommendation(rec.id)}
                    className="shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="Descartar"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <Link
                href="/malla"
                className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Ver malla curricular <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Nivel */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Nivel</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {data.stats.currentLevelNumber}
              </p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                {data.stats.currentLevel}
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
              <Award className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </div>

        {/* Puntos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Puntos</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {data.stats.totalPoints.toLocaleString()}
              </p>
              {data.stats.nextLevel && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {data.stats.pointsToNextLevel} pts para {data.stats.nextLevel}
                </p>
              )}
            </div>
            <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
            </div>
          </div>
        </div>

        {/* Promedio */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Promedio</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {data.profile.averageGrade.toFixed(1)}
              </p>
            </div>
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
              <Trophy className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </div>

        {/* Semestre */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Semestre</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {data.profile.currentSemester}
              </p>
            </div>
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
              <BookOpen className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </div>

        {/* Racha */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-5 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Racha académica</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">{data.stats.streak.current} días</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Mejor: {data.stats.streak.best} días</p>
            </div>
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center">
              <Flame className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Active Missions */}
        <div className="lg:col-span-2 bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 dark:text-white">Misiones Activas</h2>
            <Link
              href="/misiones"
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              Ver todas <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="space-y-4">
            {activeMissions.length > 0 ? (
              activeMissions.map((mission) => (
                <div
                  key={mission.id}
                  className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {mission.title}
                    </span>
                    <span className="text-sm text-yellow-600 dark:text-yellow-400">
                      +{mission.points} pts
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${mission.progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {mission.progress}% completado
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-8">
                <Target className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <p className="text-gray-500 dark:text-gray-400">No tienes misiones activas</p>
                <Link
                  href="/misiones"
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Explorar misiones disponibles
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Recent badges */}
        <div className="space-y-6">
          {/* Recent Badges */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">Insignias recientes</h2>
              <Link
                href="/logros"
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Ver todos
              </Link>
            </div>
            <div className="space-y-3">
              {data.recentBadges.length > 0 ? (
                data.recentBadges.map((badge) => (
                  <div
                    key={badge.id}
                    className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg"
                  >
                    <span className="text-2xl">{badge.icon}</span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white text-sm">
                        {badge.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {new Date(badge.earned).toLocaleDateString("es-ES")}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4">
                  <Trophy className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Aún no tienes insignias
                  </p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Recuadro flotante - Ruta recomendada urgente del docente */}
      {urgentRouteNotifications.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100%-24px)] max-w-md animate-in slide-in-from-bottom-2">
          {urgentRouteNotifications.slice(0, 1).map((urgent) => (
            <div
              key={urgent.id}
              className="rounded-2xl border-2 border-red-300 bg-white shadow-2xl dark:border-red-800 dark:bg-gray-800 overflow-hidden"
              role="alert"
              aria-live="assertive"
            >
              <div className="bg-linear-to-r from-red-600 to-orange-500 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-white">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <Send className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/90">Notificación urgente</p>
                    <p className="text-sm font-bold leading-none">De tu docente</p>
                  </div>
                </div>
                <button
                  onClick={() => dismissUrgentNotification(urgent.id)}
                  className="rounded-full p-1.5 text-white/80 hover:bg-white/20 hover:text-white transition-colors"
                  aria-label="Cerrar notificación urgente"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0" />
                  {urgent.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-300 line-clamp-4">
                  {urgent.message}
                </p>
                <div className="mt-4 flex gap-2">
                  <Link
                    href="/malla"
                    onClick={() => dismissUrgentNotification(urgent.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
                  >
                    Ver malla curricular <ChevronRight className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => dismissUrgentNotification(urgent.id)}
                    className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
                  >
                    Entendido
                  </button>
                </div>
                <p className="mt-3 text-center text-xs text-gray-400">
                  {new Date(urgent.createdAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
