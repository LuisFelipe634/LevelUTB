"use client"

import { useState, useEffect } from "react"
import {
  Gift,
  Trophy,
  Coins,
  Lock,
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  CreditCard,
  Plus,
  HelpCircle
} from "lucide-react"

interface Reward {
  id: string
  name: string
  description: string
  icon: string
  category: string
  cost: number
  maxUses: number | null
  canAfford: boolean
  canUse: boolean
  usesCount: number
  earned: {
    id: string
    status: string
    pointsSpent: number
    requestedAt: string
    reviewedAt: string | null
    reviewNote: string | null
    expiresAt: string | null
    course: {
      id: string
      code: string
      name: string
      semester: number
    }
  } | null
}

type EarnedReward = NonNullable<Reward["earned"]>

interface EnrolledCourse {
  id: string
  code: string
  name: string
  semester: number
  period: string
}

interface RewardStats {
  totalPoints: number
  totalRewards: number
  availableRewards: number
  usedRewards: number
  byCategory: Record<string, { total: number; available: number; used: number }>
}

const categoryConfig: Record<string, { label: string; color: string; bg: string; icon: React.ComponentType<{ className?: string }> }> = {
  EXAMEN: { label: "Exámenes", color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: HelpCircle },
  ASISTENCIA: { label: "Asistencia", color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: CheckCircle },
  ENTREGA: { label: "Entregas", color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: Clock },
  OTRO: { label: "Otros", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", icon: Gift }
}

const statusConfig: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  SOLICITADO: { label: "Pendiente revisión", color: "text-amber-600 dark:text-amber-400", icon: Clock },
  APROBADO: { label: "Aprobado", color: "text-green-600 dark:text-green-400", icon: CheckCircle },
  RECHAZADO: { label: "Rechazado", color: "text-red-600 dark:text-red-400", icon: XCircle },
  EXPIRADO: { label: "Expirado", color: "text-gray-500 dark:text-gray-400", icon: Clock },
  USADO: { label: "Usado", color: "text-blue-600 dark:text-blue-400", icon: CheckCircle }
}

// Texto del botón cuando la recompensa ya fue canjeada. El fallback "Expirado"
// también cubría EXPIRADO y cualquier estado desconocido.
const earnedActionLabels: Record<string, string> = {
  APROBADO: "✓ Aprobado - Disponible para usar",
  SOLICITADO: "⏳ En revisión docente",
  RECHAZADO: "✗ Rechazado",
  USADO: "✓ Ya utilizado",
}

const filterOptions = [
  { key: "all", label: "Todas", icon: Gift },
  { key: "available", label: "Disponibles", icon: Plus },
  { key: "owned", label: "Mis canjes", icon: Trophy },
  { key: "unaffordable", label: "Insuficientes", icon: Lock }
]

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("es-ES")
}

function cardBorderClass(reward: Reward): string {
  if (reward.earned) return "border-green-300 dark:border-green-600"
  if (reward.canAfford && reward.canUse) return "border-yellow-300 dark:border-yellow-600"
  return "border-gray-200 dark:border-gray-700 opacity-75"
}

function emptyStateMessage(filter: string): string {
  if (filter === "all") return "No hay recompensas disponibles"
  if (filter === "available") return "No hay recompensas disponibles para canjear ahora"
  if (filter === "owned") return "Aún no has canjeado ninguna recompensa"
  return "No hay recompensas en esta categoría"
}

function RewardEarnedStatus({ earned }: Readonly<{ earned: EarnedReward }>) {
  const status = statusConfig[earned.status] ?? statusConfig.EXPIRADO

  return (
    <div className="space-y-2 mb-3">
      <div className="flex items-center gap-2">
        <status.icon className={`w-4 h-4 ${status.color}`} />
        <span className={`text-sm ${status.color}`}>{status.label}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Solicitado: {formatDate(earned.requestedAt)}
        {earned.reviewedAt && ` · Revisado: ${formatDate(earned.reviewedAt)}`}
      </p>
      {earned.reviewNote && (
        <p className="text-xs text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 p-2 rounded">
          Nota docente: {earned.reviewNote}
        </p>
      )}
      <p className="text-xs text-blue-600 dark:text-blue-300">
        Curso objetivo: {earned.course.code} · {earned.course.name}
      </p>
      {earned.expiresAt && earned.status === "APROBADO" && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          ⏰ Expira: {formatDate(earned.expiresAt)}
        </p>
      )}
    </div>
  )
}

interface RewardRedeemFormProps {
  reward: Reward
  enrolledCourses: EnrolledCourse[]
  currentPeriod: string
  targetCourseValue: string
  evidenceValue: string
  isRedeeming: boolean
  onRedeem: () => void
  onTargetCourseChange: (value: string) => void
  onEvidenceChange: (value: string) => void
}

function RewardRedeemForm({
  reward,
  enrolledCourses,
  currentPeriod,
  targetCourseValue,
  evidenceValue,
  isRedeeming,
  onRedeem,
  onTargetCourseChange,
  onEvidenceChange
}: Readonly<RewardRedeemFormProps>) {
  if (enrolledCourses.length === 0) {
    return (
      <p className="text-xs text-amber-600 dark:text-amber-400 py-2">
        No tienes cursos matriculados oficialmente en {currentPeriod || "el periodo vigente"} para canjear.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300" htmlFor={`target-course-${reward.id}`}>
        Selecciona el curso objetivo <span className="font-normal text-gray-500">(solo del semestre actual en {currentPeriod || "el periodo vigente"})</span>
      </label>
      <select
        id={`target-course-${reward.id}`}
        value={targetCourseValue}
        onChange={(event) => onTargetCourseChange(event.target.value)}
        className="w-full rounded-lg border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-700"
      >
        <option value="">Seleccionar curso matriculado...</option>
        {enrolledCourses.map((course) => <option key={course.id} value={course.id}>{course.code} · {course.name} · {course.period}</option>)}
      </select>
      {(
        <textarea
          value={evidenceValue}
          onChange={(e) => onEvidenceChange(e.target.value)}
          placeholder="Evidencia opcional (ej: captura del parcial, justificante...)"
          rows={2}
          className="w-full rounded-lg border border-gray-300 p-2 text-xs dark:border-gray-600 dark:bg-gray-700"
        />
      )}
      <button
        onClick={onRedeem}
        disabled={isRedeeming || !targetCourseValue}
        className="w-full px-3 py-2 bg-linear-to-r from-yellow-500 to-orange-500 text-white text-sm font-medium rounded-lg hover:from-yellow-600 hover:to-orange-600 disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {isRedeeming ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Canjeando...
          </>
        ) : (
          <>
            <Gift className="w-4 h-4" />
            Canjear por {reward.cost.toLocaleString()} pts
          </>
        )}
      </button>
    </div>
  )
}

interface RewardActionProps extends Omit<RewardRedeemFormProps, "onRedeem"> {
  onRedeem: () => void
}

function RewardAction({ reward, enrolledCourses, currentPeriod, targetCourseValue, evidenceValue, isRedeeming, onRedeem, onTargetCourseChange, onEvidenceChange }: Readonly<RewardActionProps>) {
  if (reward.earned) {
    return (
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <button
          disabled
          className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm rounded-lg cursor-not-allowed"
        >
          {earnedActionLabels[reward.earned.status] ?? "Expirado"}
        </button>
      </div>
    )
  }

  if (reward.canAfford && reward.canUse) {
    return (
      <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
        <RewardRedeemForm
          reward={reward}
          enrolledCourses={enrolledCourses}
          currentPeriod={currentPeriod}
          targetCourseValue={targetCourseValue}
          evidenceValue={evidenceValue}
          isRedeeming={isRedeeming}
          onRedeem={onRedeem}
          onTargetCourseChange={onTargetCourseChange}
          onEvidenceChange={onEvidenceChange}
        />
      </div>
    )
  }

  return (
    <div className="pt-3 border-t border-gray-100 dark:border-gray-700">
      <button
        disabled
        className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 text-sm rounded-lg cursor-not-allowed"
      >
        {reward.canUse ? "Puntos insuficientes" : "Límite alcanzado"}
      </button>
    </div>
  )
}

interface RewardCardProps extends Omit<RewardRedeemFormProps, "onRedeem"> {
  availablePoints: number
  onRedeem: () => void
}

function RewardCard({
  reward,
  enrolledCourses,
  currentPeriod,
  targetCourseValue,
  evidenceValue,
  isRedeeming,
  availablePoints,
  onRedeem,
  onTargetCourseChange,
  onEvidenceChange
}: Readonly<RewardCardProps>) {
  const category = categoryConfig[reward.category] || categoryConfig.OTRO
  const CatIcon = category.icon
  const hasEarned = !!reward.earned
  const earnedStatus = reward.earned ? statusConfig[reward.earned.status] : null

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-xs border p-5 transition-all hover:shadow-lg ${cardBorderClass(reward)}`}
    >
      {/* Header: Icon & Category */}
      <div className="flex items-start justify-between mb-3">
        <div className="relative">
          <span className="text-4xl">{reward.icon}</span>
          {!hasEarned && !reward.canAfford && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900/50 rounded-full">
              <Lock className="w-6 h-6 text-white" />
            </div>
          )}
        </div>
        <div className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${category.bg} ${category.color}`}>
          <CatIcon className="w-3 h-3" />
          {category.label}
        </div>
      </div>

      {/* Name & Cost */}
      <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{reward.name}</h3>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{reward.description}</p>

      <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="font-semibold text-gray-900 dark:text-white">{reward.cost.toLocaleString()} pts</span>
        </div>
        {reward.maxUses !== null && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {reward.usesCount}/{reward.maxUses} usados
          </span>
        )}
      </div>

      {/* Progress / Status */}
      {earnedStatus && reward.earned && <RewardEarnedStatus earned={reward.earned} />}

      {!hasEarned && (
        <>
          {!reward.canUse && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Límite de usos alcanzado
            </p>
          )}
          {!reward.canAfford && reward.canUse && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Necesitas {reward.cost - availablePoints} pts más
            </p>
          )}
        </>
      )}

      {/* Action Button */}
      <RewardAction
        reward={reward}
        enrolledCourses={enrolledCourses}
        currentPeriod={currentPeriod}
        targetCourseValue={targetCourseValue}
        evidenceValue={evidenceValue}
        isRedeeming={isRedeeming}
        onRedeem={onRedeem}
        onTargetCourseChange={onTargetCourseChange}
        onEvidenceChange={onEvidenceChange}
      />
    </div>
  )
}

export default function Recompensas() {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [stats, setStats] = useState<RewardStats | null>(null)
  const [filter, setFilter] = useState<string>("all")
  const [loading, setLoading] = useState(true)
  const [redeemingId, setRedeemingId] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [enrolledCourses, setEnrolledCourses] = useState<EnrolledCourse[]>([])
  const [currentPeriod, setCurrentPeriod] = useState<string>("")
  const [targetCourse, setTargetCourse] = useState<Record<string, string>>({})

  const fetchRewards = async () => {
    try {
      const response = await fetch("/api/rewards")
      if (!response.ok) throw new Error("Error al cargar recompensas")
      const data = await response.json()
      setRewards(data.rewards)
      setStats(data.stats)
      setEnrolledCourses(data.enrolledCourses || [])
      if (data.currentPeriod) setCurrentPeriod(data.currentPeriod)
    } catch (err) {
      console.error("Error:", err)
      setError("Error al cargar las recompensas")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    fetch("/api/rewards")
      .then((response) => {
        if (!response.ok) throw new Error("Error al cargar recompensas")
        return response.json()
      })
      .then((data) => {
        if (cancelled) return
        setRewards(data.rewards)
        setStats(data.stats)
        setEnrolledCourses(data.enrolledCourses || [])
        if (data.currentPeriod) setCurrentPeriod(data.currentPeriod)
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Error:", err)
        setError("Error al cargar las recompensas")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const handleRedeem = async (rewardId: string) => {
    const reward = rewards.some(r => r.id === rewardId)
    if (!reward) return

    // Validación cliente: solo cursos matriculados oficialmente en el periodo vigente
    const selectedCourseId = targetCourse[rewardId]
    if (!selectedCourseId) {
      setError("Debes seleccionar un curso matriculado en el periodo vigente")
      return
    }
    if (enrolledCourses.length > 0 && !enrolledCourses.some((c) => c.id === selectedCourseId)) {
      setError("Solo puedes reclamar recompensas para cursos en los que estás matriculado oficialmente este semestre")
      return
    }

    setRedeemingId(rewardId)
    setError("")
    try {
      const response = await fetch("/api/rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rewardId, courseId: selectedCourseId, evidence: evidence[rewardId] })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Error al canjear recompensa")

      await fetchRewards()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al canjear la recompensa")
    } finally {
      setRedeemingId(null)
    }
  }

  const filteredRewards = rewards.filter((reward) => {
    if (filter === "all") return true
    if (filter === "available") return reward.canUse && reward.canAfford && !reward.earned
    if (filter === "owned") return !!reward.earned
    if (filter === "unaffordable") return reward.canUse && !reward.canAfford
    return reward.category === filter
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <span className="ml-2 text-gray-600 dark:text-gray-400">Cargando recompensas...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Recompensas</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Canjea tus puntos por bonificaciones en el curso
          </p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
          <Coins className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
          <span className="font-semibold text-yellow-700 dark:text-yellow-400">
            {stats?.totalPoints?.toLocaleString() || 0} pts
          </span>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Total Recompensas</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalRewards}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Disponibles</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.availableRewards}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Canjeadas</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.usedRewards}</p>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xs p-4 border border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-500 dark:text-gray-400">Puntos Totales</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{stats.totalPoints.toLocaleString()}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {enrolledCourses.length === 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <div className="flex items-start gap-2 text-amber-800 dark:text-amber-200">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">Sin cursos matriculados vigentes {currentPeriod ? `(${currentPeriod})` : ""}</p>
              <p className="mt-1">No tienes cursos con matrícula oficial (<span className="font-mono">CURSANDO/INSCRITO · UNIVERSITY</span>) en el periodo actual. Solo los cursos matriculados oficialmente en este semestre pueden recibir recompensas. Verifica tu malla en <span className="font-medium">/malla</span>.</p>
            </div>
          </div>
        </div>
      )}

      {/* Category Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        {filterOptions.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
              filter === f.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
          >
            <f.icon className="w-4 h-4" />
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-2">
        {Object.entries(categoryConfig).map(([key, config]) => {
          const catStats = stats?.byCategory[key]
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
              {catStats && (
                <span className="ml-1 text-xs">
                  ({catStats.available}/{catStats.total})
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Rewards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRewards.map((reward) => (
          <RewardCard
            key={reward.id}
            reward={reward}
            enrolledCourses={enrolledCourses}
            currentPeriod={currentPeriod}
            targetCourseValue={targetCourse[reward.id] || ""}
            evidenceValue={evidence[reward.id] || ""}
            isRedeeming={redeemingId === reward.id}
            availablePoints={stats?.totalPoints ?? 0}
            onRedeem={() => handleRedeem(reward.id)}
            onTargetCourseChange={(value) =>
              setTargetCourse((courses) => ({ ...courses, [reward.id]: value }))
            }
            onEvidenceChange={(value) =>
              setEvidence((prev) => ({ ...prev, [reward.id]: value }))
            }
          />
        ))}
      </div>

      {filteredRewards.length === 0 && (
        <div className="text-center py-12">
          <Gift className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            {emptyStateMessage(filter)}
          </p>
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <div className="flex items-start gap-3">
          <HelpCircle className="w-6 h-6 text-blue-600 dark:text-blue-400 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900 dark:text-blue-100">¿Cómo funcionan las recompensas?</h3>
            <ul className="mt-2 text-sm text-blue-800 dark:text-blue-200 space-y-1">
              <li>• Gana puntos completando misiones e insignias</li>
              <li>• Canjea puntos por bonificaciones reales en tus cursos</li>
              <li>• Las solicitudes son revisadas por docentes (pueden tardar 24-48h)</li>
              <li>• Una vez aprobadas, tienes 30 días para usar la bonificación</li>
              <li>• Si es rechazada, se te devuelven los puntos</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
