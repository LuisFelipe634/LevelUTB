"use client"

import { useState, useEffect, useEffectEvent } from "react"
import { Loader2, Building2, HardDrive, TriangleAlert } from "lucide-react"

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

// De donde salio el catalogo que se esta mostrando. Permite ver en caliente si
// las insignias vienen del servicio de la universidad o del catalogo local.
interface BadgeOrigin {
  source: "prisma" | "http"
  catalogVersion: string | null
  degraded: boolean
}

const overviewGroups = [
  { name: "Core Skills", code: "CS", category: "PROGRESO", color: "#f5ad00" },
  { name: "Power Skills", code: "PS", category: "HABITO", color: "#bf16ef" },
  { name: "Líderes UTB", code: "LU", category: "IMPACTO_SOCIAL", color: "#0794ee" },
  { name: "Conexiones Profesionales", code: "CP", category: "COMPETENCIA", color: "#35c99b" },
]

function BadgeOverviewCard({ group, badges, plus = false }: { group: typeof overviewGroups[number]; badges: Badge[]; plus?: boolean }) {
  const categoryBadges = badges.filter((badge) => badge.category === group.category && (plus ? badge.name.endsWith("Plus") : !badge.name.endsWith("Plus")))
  const earned = categoryBadges.filter((badge) => badge.earned).length
  const total = plus ? earned : categoryBadges.length
  const inProgress = Math.max(0, total - earned)
  const percentage = total ? Math.round((earned / total) * 100) : 0

  return (
    <article className="overflow-hidden rounded-2xl border border-[#e4e7eb] bg-white shadow-xs dark:border-gray-700 dark:bg-gray-800">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold text-[#0d1b34] dark:text-white">{group.name}{plus ? " Plus" : ""}</h2><p className="mt-1 text-sm text-[#8792a7]">{group.code}{plus ? "P" : ""}</p></div>
          <span className="mt-1 h-4 w-4 rounded-full" style={{ backgroundColor: group.color }} />
        </div>
        <div className="mt-5 flex items-center gap-5">
          <div className={`relative flex h-18.5 w-18.5 items-center justify-center rounded-full ${plus ? "border-[7px] border-emerald-500" : ""}`}>
            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(#f39a08 ${percentage * 3.6}deg, transparent ${percentage * 3.6}deg)` }} />
            <div className="relative h-15 w-15 rounded-full bg-white dark:bg-gray-800" />
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-[#64718a] dark:text-gray-400"><span className="h-2.5 w-2.5 rounded-full bg-[#f5ad00]" />En progreso <strong className="ml-1 text-lg leading-none text-[#0d1b34] dark:text-white">{inProgress}</strong></div>
            <div className="flex items-center gap-2 text-[#64718a] dark:text-gray-400"><span className="h-2.5 w-2.5 rounded-full bg-[#06c98b]" />Ganada <strong className="ml-1 text-lg leading-none text-[#0d1b34] dark:text-white">{earned}</strong></div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between border-t border-[#edf0f4] pt-4 text-sm"><span className="text-[#8792a7]">Total insignias</span><strong className="font-medium text-[#243653] dark:text-gray-200">{total}</strong></div>
      </div>
    </article>
  )
}

export default function Insignias() {
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [origin, setOrigin] = useState<BadgeOrigin | null>(null)

  const fetchBadges = async () => {
    try {
      const response = await fetch("/api/badges")
      if (!response.ok) throw new Error("Error al cargar insignias")
      const data = await response.json()
      setBadges(data.badges)
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
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Insignias</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Consulta tus insignias y el progreso de cada categoría
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

      <section className="space-y-5">
        <h2 className="text-xl font-semibold text-[#17335c] dark:text-white">Insignias</h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {overviewGroups.map((group) => <BadgeOverviewCard key={group.code} group={group} badges={badges} />)}
        </div>
        <h2 className="pt-3 text-xl font-semibold text-[#17335c] dark:text-white">Insignias Plus</h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {overviewGroups.map((group) => <BadgeOverviewCard key={`${group.code}-plus`} group={group} badges={badges} plus />)}
        </div>
      </section>

    </div>
  )
}
