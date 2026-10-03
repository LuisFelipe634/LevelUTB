"use client"

import { useState, useEffect, useEffectEvent } from "react"
import {
  Target,
  Trophy,
  Clock,
  CheckCircle,
  Award,
  Filter,
  Loader2,
  Play,
  Check,
  Info,
  TriangleAlert,
  X
} from "lucide-react"
import { toMissionNotice, type MissionNotice } from "@/lib/missionUi"

interface Mission {
  id: string
  title: string
  description: string
  type: string
  points: number
  autoVerify: boolean
  requiredLevel: number | null
  startDate: string | null
  endDate: string | null
  course: {
    id: string
    name: string
    code: string
  } | null
  studentMissionId: string | null
  status: string
  progress: number
  completedAt: string | null
  evidence: string | null
  reviewComment: string | null
}

interface MissionStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  totalPointsEarned: number
}

type MissionAction = "accept" | "start" | "complete"

type TypeConfig = { label: string; color: string; bg: string; icon: string }
type StatusConfig = {
  label: string
  color: string
  icon: React.ComponentType<{ className?: string }>
}

const typeConfig: Record<string, TypeConfig> = {
  ACADEMICO: { label: "Académico", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: "📚" },
  PLANIFICACION: { label: "Planificación", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", icon: "📋" },
  MEJORA_CONTINUA: { label: "Mejora", color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: "📈" },
  HABITO_ESTUDIO: { label: "Hábito", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/30", icon: "📅" },
  IMPACTO_SOCIAL: { label: "Social", color: "text-pink-600 dark:text-pink-400", bg: "bg-pink-100 dark:bg-pink-900/30", icon: "👥" }
}

const statusConfig: Record<string, StatusConfig> = {
  NO_ASIGNADA: { label: "Disponible", color: "text-gray-500 dark:text-gray-400", icon: Target },
  PENDIENTE: { label: "Pendiente", color: "text-gray-500 dark:text-gray-400", icon: Clock },
  EN_PROGRESO: { label: "En Progreso", color: "text-blue-600 dark:text-blue-400", icon: Target },
  EN_REVISION: { label: "En revisión", color: "text-amber-600 dark:text-amber-400", icon: Clock },
  COMPLETADA: { label: "Completada", color: "text-green-600 dark:text-green-400", icon: CheckCircle },
  VERIFICADA: { label: "Verificada", color: "text-purple-600 dark:text-purple-400", icon: Award },
  RECHAZADA: { label: "Requiere ajustes", color: "text-red-600 dark:text-red-400", icon: Target }
}

const filterOptions = [
  { key: "all", label: "Todas" },
  { key: "available", label: "Disponibles" },
  { key: "active", label: "Activas" },
  { key: "completed", label: "Completadas" },
  { key: "history", label: "Historial" }
]

const isActive = (mission: Mission) => mission.status === "EN_PROGRESO" || mission.status === "PENDIENTE"
const isCompleted = (mission: Mission) => mission.status === "COMPLETADA" || mission.status === "VERIFICADA"

function MissionNoticeBanner({ notice, onClose }: Readonly<{ notice: MissionNotice; onClose: () => void }>) {
  const isPending = notice.kind === "pending"
  const Icon = isPending ? Info : TriangleAlert

  return (
    <div
      role={isPending ? "status" : "alert"}
      className={`flex items-start gap-3 rounded-xl border p-4 shadow-xs ${
        isPending
          ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
          : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
      }`}
    >
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          isPending
            ? "bg-amber-100 text-amber-700 dark:bg-amber-800/50 dark:text-amber-300"
            : "bg-red-100 text-red-600 dark:bg-red-800/50 dark:text-red-300"
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-semibold ${
            isPending
              ? "text-amber-800 dark:text-amber-200"
              : "text-red-700 dark:text-red-300"
          }`}
        >
          {notice.title}
        </p>
        <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">{notice.detail}</p>
        {typeof notice.progress === "number" && (
          <div className="mt-2">
            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Progreso de verificación</span>
              <span className="font-medium">{notice.progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className={`h-full rounded-full transition-all ${
                  isPending ? "bg-amber-500" : "bg-red-500"
                }`}
                style={{ width: `${notice.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 dark:hover:bg-gray-700"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

function MissionProgress({ progress }: Readonly<{ progress: number }>) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-gray-600 dark:text-gray-400">Progreso</span>
        <span className="font-medium text-gray-900 dark:text-white">
          {progress}%
        </span>
      </div>
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className="h-full bg-linear-to-r from-blue-500 to-purple-600 rounded-full"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

function MissionHistory({ mission }: Readonly<{ mission: Mission }>) {
  return (
    <div className="mb-3 space-y-2 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
      {mission.completedAt && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Completada:</span> {new Date(mission.completedAt).toLocaleDateString("es-ES")}
        </p>
      )}
      {mission.evidence && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Evidencia:</span> {mission.evidence}
        </p>
      )}
      {mission.reviewComment && (
        <p className="text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Comentario docente:</span> {mission.reviewComment}
        </p>
      )}
      {mission.status === "EN_REVISION" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">Pendiente de revisión docente</p>
      )}
    </div>
  )
}

interface MissionActionsProps {
  mission: Mission
  isActionLoading: boolean
  evidenceValue: string
  onAction: (action: MissionAction) => void
  onEvidenceChange: (value: string) => void
}

function MissionActions({ mission, isActionLoading, evidenceValue, onAction, onEvidenceChange }: Readonly<MissionActionsProps>) {
  const busy = isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null

  return (
    <>
      {mission.status === "NO_ASIGNADA" && (
        <button
          onClick={() => onAction("accept")}
          disabled={isActionLoading}
          className="px-3 py-1 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {busy ?? "Aceptar"}
        </button>
      )}
      {(mission.status === "PENDIENTE" || mission.status === "RECHAZADA") && (
        <button
          onClick={() => onAction("start")}
          disabled={isActionLoading}
          className="px-3 py-1 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-1"
        >
          {busy ?? (
            <>
              <Play className="w-3 h-3" />
              Iniciar
            </>
          )}
        </button>
      )}
      {mission.status === "RECHAZADA" && mission.reviewComment && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">Comentario docente: {mission.reviewComment}</p>
      )}
      {(mission.status === "EN_PROGRESO" || mission.status === "RECHAZADA") && (
        <div className="flex w-full flex-col items-end gap-2">
          {!mission.autoVerify && <textarea
            value={evidenceValue}
            onChange={(event) => onEvidenceChange(event.target.value)}
            placeholder="Describe o enlaza tu evidencia"
            rows={2}
            className="w-full rounded-lg border border-gray-300 p-2 text-xs dark:border-gray-600 dark:bg-gray-700"
          />}
          <button
            onClick={() => onAction("complete")}
            disabled={isActionLoading}
            className="px-3 py-1 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1"
          >
            {busy ?? (
              <>
                <Check className="w-3 h-3" />
                {mission.autoVerify ? "Completar misión" : "Enviar a revisión"}
              </>
            )}
          </button>
        </div>
      )}
    </>
  )
}

interface MissionCardProps {
  mission: Mission
  showHistory: boolean
  isActionLoading: boolean
  evidenceValue: string
  highlighted: boolean
  pendingDetail: string | null
  pendingProgress: number | null
  onAction: (action: MissionAction) => void
  onEvidenceChange: (value: string) => void
}

function MissionCard({
  mission,
  showHistory,
  isActionLoading,
  evidenceValue,
  highlighted,
  pendingDetail,
  pendingProgress,
  onAction,
  onEvidenceChange
}: Readonly<MissionCardProps>) {
  const status = statusConfig[mission.status] || statusConfig.NO_ASIGNADA
  const type = typeConfig[mission.type] || typeConfig.ACADEMICO
  const StatusIcon = status.icon
  // El fallback del icono es "👥", no el de typeConfig.ACADEMICO: así se
  // comportaba el ternario original y el badge y el icono pueden discrepar
  // cuando el tipo no está en el catálogo.
  const typeIcon = typeConfig[mission.type]?.icon ?? "👥"

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-xs border p-5 hover:shadow-lg transition-shadow ${
        highlighted
          ? "border-amber-400 ring-2 ring-amber-300 dark:border-amber-600 dark:ring-amber-700"
          : "border-gray-200 dark:border-gray-700"
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <span className="text-3xl">{typeIcon}</span>
        <div className="flex items-center gap-1">
          <span className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
            +{mission.points}
          </span>
        </div>
      </div>

      {/* Title & Description */}
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
        {mission.title}
      </h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
        {mission.description}
      </p>

      {/* Type Badge */}
      <div className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${type.bg} ${type.color} mb-3`}>
        {type.label}
      </div>

      {/* Course if any */}
      {mission.course && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          📖 {mission.course.code} - {mission.course.name}
        </p>
      )}

      {/* Progress */}
      {isActive(mission) && mission.progress > 0 && <MissionProgress progress={mission.progress} />}

      {/* Aviso normal: la misión aún no cumple la verificación */}
      {pendingDetail && (
        <div
          role="status"
          className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <p className="font-semibold">Aún no puedes completar esta misión</p>
          <p className="mt-0.5">{pendingDetail}</p>
          {typeof pendingProgress === "number" && (
            <p className="mt-1 font-medium">Progreso de verificación: {pendingProgress}%</p>
          )}
        </div>
      )}

      {mission.autoVerify && isActive(mission) && !pendingDetail && (
        <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
          Esta misión se verifica automáticamente al completarla.
        </p>
      )}

      {/* History Details */}
      {showHistory && mission.studentMissionId && <MissionHistory mission={mission} />}

      {/* Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-1">
          <StatusIcon className={`w-4 h-4 ${status.color}`} />
          <span className={`text-sm ${status.color}`}>{status.label}</span>
        </div>

        {/* Action Buttons (hidden in history view) */}
        {!showHistory && (
          <MissionActions
            mission={mission}
            isActionLoading={isActionLoading}
            evidenceValue={evidenceValue}
            onAction={onAction}
            onEvidenceChange={onEvidenceChange}
          />
        )}
      </div>
    </div>
  )
}

export default function Misiones() {
  const [missions, setMissions] = useState<Mission[]>([])
  const [stats, setStats] = useState<MissionStats | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<MissionNotice | null>(null)

  const fetchMissions = async () => {
    try {
      const response = await fetch("/api/missions")
      if (!response.ok) throw new Error("Error al cargar misiones")
      const data = await response.json()
      setMissions(data.missions)
      setStats(data.stats)
    } catch (error) {
      console.error("Error:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadMissions = useEffectEvent(fetchMissions)

  useEffect(() => {
    // Load mission data from the server when the page becomes available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadMissions()
  }, [])

  const handleMissionAction = async (missionId: string, action: MissionAction) => {
    setActionLoading(missionId)
    try {
      const response = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId, action, evidence: evidence[missionId] })
      })

      if (!response.ok) {
        // El backend para misiones autoVerify devuelve { error, message, progress }.
        // `message` + `progress` significa "aún no cumple": se muestra como
        // pestaña informativa, no como error técnico.
        let payload: { error?: string; message?: string; progress?: number } = {}
        try {
          payload = (await response.json()) as typeof payload
        } catch {
          payload = { error: "No se pudo procesar la misión" }
        }
        setNotice(toMissionNotice(payload, missionId))
        return
      }

      if (notice?.missionId === missionId) setNotice(null)
      // Recargar misiones
      await fetchMissions()
    } catch (error) {
      console.error("Error:", error)
      setNotice(toMissionNotice({ error: "Error de conexión. Revisa tu internet e inténtalo de nuevo." }, missionId))
    } finally {
      setActionLoading(null)
    }
  }

  const showHistory = filter === "history"

  const filteredMissions = missions.filter((mission) => {
    if (filter === "all") return true
    if (filter === "available") return mission.status === "NO_ASIGNADA"
    if (filter === "active") return isActive(mission)
    if (filter === "completed") return isCompleted(mission)
    if (showHistory) return mission.studentMissionId !== null
    return mission.type === filter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando misiones...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Misiones</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Completa retos y gana puntos
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
          <Trophy className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="font-semibold text-yellow-700 dark:text-yellow-400">
            {stats?.totalPointsEarned || 0} pts ganados
          </span>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Pendientes</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">En Progreso</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.inProgress}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Completadas</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completed}</p>
          </div>
        </div>
      )}

      {/* Pestaña informativa: misión aún no completable vs error real */}
      {notice && (
        <MissionNoticeBanner notice={notice} onClose={() => setNotice(null)} />
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-5 h-5 text-gray-400" />
        {filterOptions.map((f) => (
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

      {/* Missions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMissions.map((mission) => {
          const pendingForCard = notice?.missionId === mission.id ? notice : null
          return (
            <MissionCard
              key={mission.id}
              mission={mission}
              showHistory={showHistory}
              isActionLoading={actionLoading === mission.id}
              evidenceValue={evidence[mission.id] || ""}
              highlighted={pendingForCard?.kind === "pending"}
              pendingDetail={pendingForCard?.kind === "pending" ? pendingForCard.detail : null}
              pendingProgress={pendingForCard?.kind === "pending" ? (pendingForCard.progress ?? null) : null}
              onAction={(action) => handleMissionAction(mission.id, action)}
              onEvidenceChange={(value) =>
                setEvidence((previous) => ({ ...previous, [mission.id]: value }))
              }
            />
          )
        })}
      </div>

      {filteredMissions.length === 0 && (
        <div className="text-center py-12">
          <Target className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {filter === "all"
              ? "No hay misiones disponibles"
              : "No hay misiones en esta categoría"}
          </p>
        </div>
      )}
    </div>
  )
}
