"use client"

import { useState, useEffect, useEffectEvent } from "react"
import {
  Trophy,
  Award,
  Star,
  Target,
  Users,
  TrendingUp,
  Lock,
  CheckCircle,
  Loader2,
  Building2,
  HardDrive,
  TriangleAlert
} from "lucide-react"

interface Badge {
  id: string
  name: string
  description: string
  icon: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
  earned: boolean
  earnedAt: string | null
  evidence: string | null
  progress: { current: number; target: number; percentage: number } | null
}

interface BadgeStats {
  total: number
  earned: number
  percentage: number
  byCategory: Record<string, { total: number; earned: number }>
}

// De donde salio el catalogo que se esta mostrando. Permite ver en caliente si
// las insignias vienen del servicio de la universidad o del catalogo local.
interface BadgeOrigin {
  source: "prisma" | "http"
  catalogVersion: string | null
  degraded: boolean
}

const categoryConfig: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  PROGRESO: { label: "Progreso", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: TrendingUp },
  HABITO: { label: "Hábito", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", icon: Target },
  COMPETENCIA: { label: "Competencia", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", icon: Award },
  IMPACTO_SOCIAL: { label: "Social", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30", icon: Users },
  RENDIMIENTO: { label: "Rendimiento", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/30", icon: Star }
}

export default function Logros() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [stats, setStats] = useState<BadgeStats | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState<BadgeOrigin | null>(null)

  const fetchBadges = async () => {
    try {
      const response = await fetch("/api/badges")
      if (!response.ok) throw new Error("Error al cargar insignias")
      const data = await response.json()
      setBadges(data.badges)
      setStats(data.stats)
      setOrigin(data.origin ?? null)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadBadges = useEffectEvent(fetchBadges)

  useEffect(() => {
    // Load and synchronize badges when the page becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBadges()
  }, [])

  const filteredBadges = badges.filter((badge) => {
    if (filter === "all") return true
    if (filter === "earned") return badge.earned
    if (filter === "locked") return !badge.earned
    return badge.category === filter
  })

  // Configuracion del chip de origen. "degraded" gana: si se pidio el catalogo
  // institucional y no vino, lo relevante es que se esta viendo el local.
  const originChip = !origin
    ? null
    : origin.degraded
      ? { label: "Catalogo local (API de la universidad no disponible)", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", Icon: TriangleAlert }
      : origin.source === "http"
        ? { label: `Catalogo de la Universidad${origin.catalogVersion ? ` v${origin.catalogVersion}` : ""}`, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", Icon: Building2 }
        : { label: "Catalogo local", cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200", Icon: HardDrive }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando insignias...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Logros e Insignias</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Colecciona insignias por tus logros académicos
        </p>
        {originChip && (
          <span
            title={
              origin?.degraded
                ? "Se pidio el catalogo institucional pero no respondio, asi que se muestra el catalogo local."
                : "Origen del catalogo de insignias que se esta mostrando."
            }
            className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${originChip.cls}`}
          >
            <originChip.Icon className="h-3.5 w-3.5" />
            {originChip.label}
          </span>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-2xl flex items-center justify-center">
                <Trophy className="w-8 h-8 text-white" />
              </div>
              <div>
                <p className="text-3xl font-bold text-gray-900 dark:text-white">
                  {stats.earned} / {stats.total}
                </p>
                <p className="text-gray-500 dark:text-gray-400">Insignias obtenidas</p>
              </div>
            </div>
            <div className="text-right">
              <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full"
                  style={{ width: `${stats.percentage}%` }}
                />
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {stats.percentage}% completado
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { key: "all", label: "Todas" },
          { key: "earned", label: "Obtenidas" },
          { key: "locked", label: "Bloqueadas" }
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Category Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {Object.entries(categoryConfig).map(([key, config]) => {
          const categoryStats = stats?.byCategory[key]
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                filter === key
                  ? `${config.bg} ${config.color}`
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              <config.icon className="w-4 h-4" />
              {config.label}
              {categoryStats && (
                <span className="ml-1 text-xs">
                  ({categoryStats.earned}/{categoryStats.total})
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {filteredBadges.map((badge) => {
          const category = categoryConfig[badge.category] || categoryConfig.PROGRESO
          const CatIcon = category.icon

          return (
            <div
              key={badge.id}
              className={`bg-white dark:bg-gray-800 rounded-xl shadow-xs border p-5 transition-all hover:shadow-lg ${
                badge.earned
                  ? "border-yellow-300 dark:border-yellow-600"
                  : "border-gray-200 dark:border-gray-700 opacity-75"
              }`}
            >
              {/* Badge Icon */}
              <div className="relative mb-4">
                {badge.icon.startsWith("http") ? (
                  <img src={badge.icon} alt={badge.name} className="w-14 h-14 rounded-full object-cover" loading="lazy" />
                ) : (
                  <span className="text-5xl">{badge.icon}</span>
                )}
                {!badge.earned && (
                  <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 rounded-full w-14 h-14">
                    <Lock className="w-6 h-6 text-white" />
                  </div>
                )}
              </div>

              {/* Name & Category */}
              <div className="flex items-center gap-2 mb-2">
                <h3 className="font-semibold text-gray-900 dark:text-white">{badge.name}</h3>
                {badge.earned && <CheckCircle className="w-4 h-4 text-green-500" />}
              </div>
              <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${category.bg} ${category.color} mb-2`}>
                <CatIcon className="w-3 h-3" />
                {category.label}
              </div>

              {/* Description */}
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                {badge.description}
              </p>

              {/* Progress or Earned */}
              {badge.earned ? (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <CheckCircle className="w-4 h-4" />
                  <span>Obtenida {new Date(badge.earnedAt!).toLocaleDateString("es-ES")}</span>
                </div>
              ) : (
                <div>
                  {badge.progress && (
                    <div className="mb-2">
                      <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400"><span>Progreso</span><span>{badge.progress.current}/{badge.progress.target}</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700"><div className="h-full rounded-full bg-blue-500" style={{ width: `${badge.progress.percentage}%` }} /></div>
                    </div>
                  )}
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {badge.requiredLevel && `Requiere nivel ${badge.requiredLevel}`}
                    {badge.pointsRequired && `Requiere ${badge.pointsRequired} puntos`}
                    {!badge.requiredLevel && !badge.pointsRequired && "Sigue trabajando para desbloquearla"}
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filteredBadges.length === 0 && (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {filter === "all"
              ? "No hay insignias disponibles"
              : "No hay insignias en esta categoría"}
          </p>
        </div>
      )}
    </div>
  )
}
