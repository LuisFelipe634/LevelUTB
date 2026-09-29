"use client"

import { Suspense, useEffect, useEffectEvent, useMemo, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Gift,
  Loader2,
  Search,
  Users,
} from "lucide-react"

type CourseStudent = {
  id: string
  name: string
  studentCode: string
  averageGrade: number
  totalCredits: number
  risk: string | null
  totalPoints: number
  earnedBadgesCount: number
  badges: { name: string; icon: string; category: string; earnedAt: string | Date | null; evidence: string | null }[]
  rewardStatus: "PENDIENTE" | "APROBADO" | "REALIZADO" | "SIN_NOVEDADES"
  pendingRewardsCount: number
  rewardHistory: { id: string; name: string; status: string; pointsSpent: number; courseCode: string; requestedAt: string; reviewedAt: string | null }[]
}

type TeacherCourse = {
  id: string
  code: string
  name: string
  semester: number
  period: string
  students: CourseStudent[]
  pendingRewardsCount: number
}

type PendingMission = {
  id: string
  title: string
  description: string
  points: number
  evidence: string | null
  completedAt: string | null
  status: string
  studentId?: string
  studentName?: string
  studentCode?: string
  course?: { code: string; name: string } | null
}

type MissionHistory = {
  id: string
  studentId: string
  studentName: string
  studentCode: string | null
  title: string
  points: number
  verifiedAt: string | null
}

type PendingReward = {
  id: string
  studentId: string
  studentName: string
  studentCode: string | null
  courses: { id: string; code: string; name: string; semester: number; period: string; assignmentId: string | null }[]
  reward: { id: string; name: string; description: string; icon: string; category: string; cost: number }
  pointsSpent: number
  evidence: string | null
  requestedAt: string
  expiresAt: string | null
}

type ReviewedReward = {
  id: string
  studentId: string
  studentName: string
  studentCode: string | null
  rewardName: string
  status: string
  pointsSpent: number
  reviewNote: string | null
  reviewedAt: string | null
  course: { id: string; code: string; name: string; semester: number }
}

type Section = "cursos" | "misiones" | "recompensas" | "historial"

const SECTION_META: Record<Section, { title: string; description: string; icon: typeof Users }> = {
  cursos: { title: "Mis estudiantes", description: "Estudiantes matriculados en el curso seleccionado.", icon: Users },
  misiones: { title: "Misiones por revisar", description: "Revisa la evidencia y otorga los puntos correspondientes.", icon: Clock },
  recompensas: { title: "Recompensas por revisar", description: "Aprueba o rechaza las solicitudes de canje.", icon: Gift },
  historial: { title: "Historial", description: "Misiones verificadas y recompensas ya revisadas.", icon: CheckCircle2 },
}

function rewardStatusLabel(status: CourseStudent["rewardStatus"], pending: number) {
  if (status === "PENDIENTE") return `Canje pendiente${pending > 1 ? ` (${pending})` : ""}`
  if (status === "APROBADO") return "Recompensa aprobada"
  if (status === "REALIZADO") return "Canje realizado"
  return "Sin novedades"
}

function rewardStatusStyle(status: CourseStudent["rewardStatus"]) {
  if (status === "PENDIENTE") return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
  if (status === "APROBADO") return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
  if (status === "REALIZADO") return "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
}

function initialsOf(name: string) {
  return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase()
}

function TeachersContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get("section")
  const courseParam = searchParams.get("course")

  const section: Section =
    sectionParam === "misiones" || sectionParam === "recompensas" || sectionParam === "historial"
      ? sectionParam
      : "cursos"

  const [courses, setCourses] = useState<TeacherCourse[]>([])
  const [pendingMissionsAll, setPendingMissionsAll] = useState<PendingMission[]>([])
  const [missionHistory, setMissionHistory] = useState<MissionHistory[]>([])
  const [pendingRewardsAll, setPendingRewardsAll] = useState<PendingReward[]>([])
  const [reviewedRewards, setReviewedRewards] = useState<ReviewedReward[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [search, setSearch] = useState("")
  const [expandedStudentId, setExpandedStudentId] = useState<string | null>(null)
  const [reviewLoading, setReviewLoading] = useState<string | null>(null)
  const [reviewComment, setReviewComment] = useState<Record<string, string>>({})
  const [rewardReviewLoading, setRewardReviewLoading] = useState<string | null>(null)
  const [rewardReviewComment, setRewardReviewComment] = useState<Record<string, string>>({})

  const loadData = async () => {
    setLoading(true)
    setError("")
    try {
      const [teacherRes, rewardsRes] = await Promise.all([fetch("/api/teacher"), fetch("/api/teacher/rewards")])
      if (!teacherRes.ok) throw new Error("No se pudo cargar la información")
      const teacher = await teacherRes.json()
      setCourses(teacher.courses || [])
      setPendingMissionsAll(teacher.pendingMissions || [])
      setMissionHistory(teacher.missionHistory || [])
      if (rewardsRes.ok) {
        const rewards = await rewardsRes.json()
        setPendingRewardsAll(rewards.pending || [])
        setReviewedRewards(rewards.reviewed || [])
      }
    } catch {
      setError("No se pudo cargar la información de los estudiantes. Inténtalo de nuevo.")
    } finally {
      setLoading(false)
    }
  }

  const loadTeachersData = useEffectEvent(loadData)

  useEffect(() => {
    // The event loads external teacher data and updates the panel state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTeachersData()
  }, [])

  const selectedCourse: TeacherCourse | undefined = useMemo(() => {
    if (!courses.length) return undefined
    return courses.find((c) => c.id === courseParam) || courses[0]
  }, [courses, courseParam])

  const setCourse = (courseId: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("course", courseId)
    router.replace(`/docentes?${params.toString()}`)
  }

  const studentIds = useMemo(() => new Set(selectedCourse?.students.map((s) => s.id) || []), [selectedCourse])

  const courseRewardCourseIds = useMemo(() => new Set([selectedCourse?.id].filter(Boolean) as string[]), [selectedCourse])

  const pendingMissions = useMemo(
    () => pendingMissionsAll.filter((m) => m.studentId && studentIds.has(m.studentId)),
    [pendingMissionsAll, studentIds]
  )

  const pendingRewards = useMemo(() => {
    if (!selectedCourse) return pendingRewardsAll
    return pendingRewardsAll.filter((r) => r.courses.some((c) => courseRewardCourseIds.has(c.id)))
  }, [pendingRewardsAll, selectedCourse, courseRewardCourseIds])

  const courseMissionHistory = useMemo(
    () => missionHistory.filter((h) => studentIds.has(h.studentId)),
    [missionHistory, studentIds]
  )

  const courseRewardHistory = useMemo(
    () => (selectedCourse ? reviewedRewards.filter((r) => r.course.id === selectedCourse.id) : reviewedRewards),
    [reviewedRewards, selectedCourse]
  )

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!selectedCourse || !term) return selectedCourse?.students || []
    return (selectedCourse?.students || []).filter(
      (s) => s.name.toLowerCase().includes(term) || s.studentCode.toLowerCase().includes(term)
    )
  }, [selectedCourse, search])

  const totalStudents = courses.reduce((t, c) => t + c.students.length, 0)
  const meta = SECTION_META[section]
  const SectionIcon = meta.icon

  const reviewMission = async (id: string, decision: "approve" | "reject") => {
    setReviewLoading(id)
    try {
      const res = await fetch("/api/teacher", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentMissionId: id, decision, comment: reviewComment[id] }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo revisar la misión")
      setPendingMissionsAll((list) => list.filter((m) => m.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo revisar la misión")
    } finally {
      setReviewLoading(null)
    }
  }

  const reviewReward = async (id: string, decision: "approve" | "reject") => {
    setRewardReviewLoading(id)
    try {
      const res = await fetch("/api/teacher/rewards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentRewardId: id, decision, comment: rewardReviewComment[id] }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "No se pudo revisar la recompensa")
      setPendingRewardsAll((list) => list.filter((r) => r.id !== id))
      if (selectedCourse) {
        setCourses((prev) =>
          prev.map((c) => (c.id === selectedCourse.id ? { ...c, pendingRewardsCount: Math.max(0, c.pendingRewardsCount - 1) } : c))
        )
      }
      const refreshed = await fetch("/api/teacher/rewards")
      if (refreshed.ok) setReviewedRewards((await refreshed.json()).reviewed || [])
    } catch (e) {
      alert(e instanceof Error ? e.message : "No se pudo revisar la recompensa")
    } finally {
      setRewardReviewLoading(null)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        <div className="h-64 animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-800" />
        <p className="flex items-center justify-center gap-2 py-6 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando panel docente…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
        <h2 className="mt-3 text-lg font-bold text-gray-900 dark:text-white">Algo salió mal</h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">{error}</p>
        <button onClick={loadData} className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">Reintentar</button>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* Encabezado de la sección activa */}
      <header className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300">
              <SectionIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600 dark:text-blue-400">Panel docente</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{meta.title}</h1>
              <p className="mt-1 max-w-xl text-sm text-slate-500 dark:text-gray-400">{meta.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-gray-700 dark:text-gray-200">{courses.length} cursos</span>
            <span className="rounded-full bg-slate-100 px-3 py-1.5 text-slate-700 dark:bg-gray-700 dark:text-gray-200">{totalStudents} estudiantes</span>
            <span className="rounded-full bg-amber-100 px-3 py-1.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">{pendingMissionsAll.length} misiones pendientes</span>
            <span className="rounded-full bg-violet-100 px-3 py-1.5 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">{pendingRewardsAll.length} canjes pendientes</span>
          </div>
        </div>

        {/* Cursos asignados como bloques interactivos */}
        {courses.length > 0 && (
          <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 dark:border-gray-700 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => {
              const active = selectedCourse?.id === course.id
              return (
                <button
                  key={course.id}
                  type="button"
                  onClick={() => setCourse(course.id)}
                  className={`group flex min-h-28 items-center justify-between rounded-xl border p-4 text-left transition-colors ${
                    active
                      ? "border-blue-500 bg-blue-50 text-blue-900 shadow-sm dark:bg-blue-900/30 dark:text-blue-100"
                      : "border-slate-200 bg-slate-50 text-slate-700 hover:border-blue-300 hover:bg-blue-50/60 dark:border-gray-600 dark:bg-gray-700/60 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-300">{course.code}</span>
                    <span className="mt-1 block truncate font-semibold">{course.name}</span>
                    <span className="mt-2 block text-xs text-slate-500 dark:text-gray-400">{course.students.length} estudiantes · Semestre {course.semester}</span>
                  </span>
                  <ChevronRight className={`h-5 w-5 shrink-0 transition-transform ${active ? "translate-x-1 text-blue-600" : "text-slate-400 group-hover:translate-x-1"}`} />
                </button>
              )
            })}
          </div>
        )}
        {selectedCourse && (
          <p className="mt-3 text-sm text-slate-500 dark:text-gray-400">
            <span className="font-semibold text-slate-700 dark:text-gray-200">{selectedCourse.code} · {selectedCourse.name}</span>
            {" · "}Semestre {selectedCourse.semester} · {selectedCourse.period}
          </p>
        )}
      </header>

      {/* Contenido según sección */}
      {section === "cursos" && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-gray-700">
            <div className="relative w-full max-w-sm">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o código…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-900"
              />
            </div>
            <span className="text-sm font-semibold text-slate-500 dark:text-gray-400">{filteredStudents.length} estudiantes</span>
          </div>

          {filteredStudents.length === 0 ? (
            <div className="p-10 text-center">
              <Users className="mx-auto h-10 w-10 text-gray-300" />
              <p className="mt-3 font-semibold text-gray-900 dark:text-white">{selectedCourse ? "Sin resultados" : "Sin cursos asignados"}</p>
              <p className="mt-1 text-sm text-gray-500">{selectedCourse ? "Prueba con otro término de búsqueda o cambia de curso." : "Actualmente no tienes cursos asignados."}</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-gray-700">
              {filteredStudents.map((student) => {
                const expanded = expandedStudentId === student.id
                return (
                  <li key={student.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedStudentId(expanded ? null : student.id)}
                      className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-gray-700/40"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-sm font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                        {initialsOf(student.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-gray-900 dark:text-white">{student.name}</span>
                          {student.risk && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                              <AlertTriangle className="h-3 w-3" /> En riesgo
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-gray-500">
                          {student.studentCode} · Promedio {student.averageGrade.toFixed(1)} · {student.totalCredits} créditos · {student.totalPoints.toLocaleString("es-CO")} pts
                        </span>
                      </span>
                      <span className={`hidden shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold sm:inline-block ${rewardStatusStyle(student.rewardStatus)}`}>
                        {rewardStatusLabel(student.rewardStatus, student.pendingRewardsCount)}
                      </span>
                      <ChevronRight className={`h-5 w-5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                    </button>
                    {expanded && (
                      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-4 dark:border-gray-700 dark:bg-gray-700/30 sm:px-6">
                        <div className="grid gap-3 sm:grid-cols-5">
                          {[
                            { label: "Promedio", value: student.averageGrade.toFixed(1) },
                            { label: "Créditos", value: String(student.totalCredits) },
                            { label: "Puntos", value: student.totalPoints.toLocaleString("es-CO") },
                            { label: "Insignias obtenidas", value: String(student.earnedBadgesCount) },
                            { label: "Estado de canje", value: rewardStatusLabel(student.rewardStatus, student.pendingRewardsCount) },
                          ].map((stat) => (
                            <div key={stat.label} className="rounded-lg border border-slate-100 bg-white p-3 dark:border-gray-600 dark:bg-gray-800">
                              <p className="text-xs text-gray-500">{stat.label}</p>
                              <p className="mt-0.5 font-bold text-gray-900 dark:text-white">{stat.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="mt-4">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">Insignias obtenidas</p>
                          {student.badges.length ? (
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                              {student.badges.map((badge) => (
                                <li key={`${student.id}-${badge.name}`} className="flex items-center gap-3 rounded-lg border border-emerald-100 bg-emerald-50/70 px-3 py-2 dark:border-emerald-900/50 dark:bg-emerald-900/20">
                                  <span className="text-xl" aria-hidden="true">{badge.icon}</span>
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{badge.name}</span>
                                    <span className="block text-xs text-gray-500 dark:text-gray-400">{badge.category}</span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-sm text-gray-500">Este estudiante aún no tiene insignias obtenidas.</p>
                          )}
                        </div>
                        <p className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">Historial de canjes</p>
                        {(student.rewardHistory || []).length ? (
                          <ul className="mt-2 space-y-2">
                            {(student.rewardHistory || []).map((r) => (
                              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800">
                                <span className="text-gray-700 dark:text-gray-200">{r.name} · {r.courseCode}</span>
                                <span className="font-semibold text-gray-500">{r.status} · {r.pointsSpent} pts</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-2 text-sm text-gray-500">Sin canjes registrados.</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}

      {section === "misiones" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          {pendingMissions.length === 0 ? (
            <EmptyState icon={<Clock className="h-10 w-10 text-gray-300" />} title="Sin misiones pendientes" hint="No hay entregas por revisar en este curso." />
          ) : (
            <ul className="space-y-3">
              {pendingMissions.map((mission) => (
                <li key={mission.id} className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-white">{mission.studentName} · {mission.studentCode}</p>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{mission.title} <span className="font-semibold text-blue-600">(+{mission.points} pts)</span></p>
                      {mission.course && <p className="mt-0.5 text-xs font-semibold text-blue-600 dark:text-blue-300">{mission.course.code} · {mission.course.name}</p>}
                      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                        <span className="font-semibold">Evidencia:</span> {mission.evidence || "Sin evidencia"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{mission.completedAt ? new Date(mission.completedAt).toLocaleDateString("es-CO") : ""}</span>
                  </div>
                  <input
                    value={reviewComment[mission.id] || ""}
                    onChange={(e) => setReviewComment((c) => ({ ...c, [mission.id]: e.target.value }))}
                    placeholder="Comentario opcional para el estudiante…"
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-900"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button onClick={() => reviewMission(mission.id, "reject")} disabled={reviewLoading === mission.id} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-900/20">Devolver</button>
                    <button onClick={() => reviewMission(mission.id, "approve")} disabled={reviewLoading === mission.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {reviewLoading === mission.id ? "Procesando…" : "Aprobar y otorgar puntos"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === "recompensas" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          {pendingRewards.length === 0 ? (
            <EmptyState icon={<Gift className="h-10 w-10 text-gray-300" />} title="Sin solicitudes pendientes" hint="No hay canjes por revisar en este curso." />
          ) : (
            <ul className="space-y-3">
              {pendingRewards.map((item) => (
                <li key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-gray-700">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="text-3xl">{item.reward.icon}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900 dark:text-white">{item.studentName} · {item.studentCode}</p>
                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-200">{item.reward.name} <span className="font-semibold text-blue-600">({item.reward.cost.toLocaleString("es-CO")} pts)</span></p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {item.courses.map((c) => (
                            <span key={`${item.id}-${c.id}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-gray-700 dark:text-gray-300">{c.code} · {c.period}</span>
                          ))}
                        </div>
                        <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-gray-600 dark:bg-gray-700/60 dark:text-gray-300">
                          <span className="font-semibold">Evidencia:</span> {item.evidence || "Sin evidencia"}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-gray-400">{new Date(item.requestedAt).toLocaleDateString("es-CO")}</span>
                  </div>
                  <input
                    value={rewardReviewComment[item.id] || ""}
                    onChange={(e) => setRewardReviewComment((c) => ({ ...c, [item.id]: e.target.value }))}
                    placeholder="Comentario opcional (motivo de rechazo, indicaciones…)…"
                    className="mt-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-gray-600 dark:bg-gray-700 dark:focus:ring-blue-900"
                  />
                  <div className="mt-3 flex justify-end gap-2">
                    <button onClick={() => reviewReward(item.id, "reject")} disabled={rewardReviewLoading === item.id} className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-900/20">Rechazar y reembolsar</button>
                    <button onClick={() => reviewReward(item.id, "approve")} disabled={rewardReviewLoading === item.id} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
                      {rewardReviewLoading === item.id ? "Procesando…" : "Aprobar bonificación"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {section === "historial" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800 sm:p-6">
          {courseMissionHistory.length + courseRewardHistory.length === 0 ? (
            <EmptyState icon={<BookOpen className="h-10 w-10 text-gray-300" />} title="Sin actividad todavía" hint="Aquí aparecerán las misiones verificadas y las recompensas revisadas." />
          ) : (
            <ul className="space-y-2.5">
              {courseMissionHistory.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-700/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40"><CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{h.studentName}</p>
                      <p className="truncate text-sm text-gray-500">{h.title} · <span className="font-semibold text-emerald-600">+{h.points} pts</span></p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{h.verifiedAt ? new Date(h.verifiedAt).toLocaleDateString("es-CO") : ""}</span>
                </li>
              ))}
              {courseRewardHistory.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 dark:bg-gray-700/40">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/40"><Gift className="h-4 w-4 text-violet-600 dark:text-violet-300" /></span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{r.studentName} · {r.rewardName}</p>
                      <p className={`text-xs font-semibold ${r.status === "APROBADO" ? "text-emerald-600" : "text-red-500"}`}>{r.status} · {r.pointsSpent.toLocaleString("es-CO")} pts</p>
                      {r.reviewNote && <p className="truncate text-xs text-gray-400">Nota: {r.reviewNote}</p>}
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">{r.reviewedAt ? new Date(r.reviewedAt).toLocaleDateString("es-CO") : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function EmptyState({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-gray-700">{icon}</div>
      <p className="mt-4 font-semibold text-gray-900 dark:text-white">{title}</p>
      <p className="mt-1 text-sm text-gray-500">{hint}</p>
    </div>
  )
}

export default function TeachersPage() {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center text-sm text-gray-500"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cargando…</div>}>
      <TeachersContent />
    </Suspense>
  )
}
