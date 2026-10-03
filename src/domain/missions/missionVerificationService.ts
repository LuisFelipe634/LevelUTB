import type { VerificationResult, VerificationProfile } from "./types"
import {
  computeConsecutiveAccessStreak,
  countUniqueCompletedMissions,
} from "./missionRules"

const CREDITS_PER_SEMESTER = 12
const ACCESS_STREAK_TARGET = 7
const WEEKLY_MISSION_TARGET = 3

export type VerificationContext = {
  userId: string
  verificationValue: string | null
  metadata: string | null
  currentPeriod: string
  profile: VerificationProfile
  approvedCredits: number
  approvedCourseIds: ReadonlySet<string>
}

export type VerificationHandler = (
  context: VerificationContext
) => VerificationResult | Promise<VerificationResult>

export function failed(
  message: string,
  progress = 0
): VerificationResult {
  return { passed: false, progress, message }
}

export function passed(
  message: string,
  progress = 100
): VerificationResult {
  return { passed: true, progress, message }
}

export function cappedPercent(partial: number, total: number): number {
  if (total > 0) {
    return Math.min(99, Math.round((partial / total) * 100))
  }

  return 0
}

export function buildApprovedCredits(
  enrollments: VerificationProfile["enrollments"]
): Map<string, number> {
  const approvedByCourse = new Map<string, number>()

  for (const enrollment of enrollments) {
    if (enrollment.status === "APROBADO" && enrollment.course) {
      approvedByCourse.set(
        enrollment.courseId,
        enrollment.course.credits
      )
    }
  }

  return approvedByCourse
}

export function parseInitialAverage(
  metadata: string | null | undefined,
  fallback: number
): number {
  if (!metadata) {
    return fallback
  }

  try {
    const parsed = JSON.parse(metadata) as {
      initialAverage?: unknown
    } | null

    if (parsed && typeof parsed.initialAverage === "number") {
      return parsed.initialAverage
    }
  } catch {
    // Preserve the original fallback behavior for invalid metadata.
  }

  return fallback
}

export function getCurrentPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() < 6 ? 1 : 2}`
}

type GradeRecord = {
  grade: number
  credits: number
}

function getAverageGrade(
  academicHistory: VerificationProfile["academicHistory"],
  enrollments: VerificationProfile["enrollments"],
  fallback: number
): number {
  const historyGrades = toGradeRecords(
    academicHistory.filter(
      (record) =>
        record.status !== "PENDIENTE" &&
        Number.isFinite(record.grade)
    )
  )

  const historyAverage = weightedAverage(historyGrades)
  if (historyAverage !== null) {
    return historyAverage
  }

  const enrollmentGrades = toGradeRecords(
    enrollments.filter(
      (record) =>
        Number.isFinite(record.grade) &&
        (record.source !== "MANUAL" || record.status === "APROBADO")
    )
  )

  return weightedAverage(enrollmentGrades) ?? fallback
}

function toGradeRecords(
  records: Array<{
    grade?: number | null
    credits?: number
    course?: { credits?: number } | null
  }>
): GradeRecord[] {
  return records.map((record) => ({
    grade: record.grade as number,
    credits: creditsOf(record),
  }))
}

function creditsOf(record: {
  credits?: number
  course?: { credits?: number } | null
}): number {
  const credits = record.credits ?? record.course?.credits
  return typeof credits === "number" && credits > 0 ? credits : 1
}

function weightedAverage(grades: GradeRecord[]): number | null {
  const totalCredits = grades.reduce(
    (total, item) => total + item.credits,
    0
  )

  if (totalCredits <= 0) {
    return null
  }

  const total = grades.reduce(
    (sum, item) => sum + item.grade * item.credits,
    0
  )

  return Number((total / totalCredits).toFixed(2))
}

function getApprovedCreditsForPeriod(
  enrollments: VerificationProfile["enrollments"],
  period: string
): number {
  return enrollments
    .filter(
      (enrollment) =>
        enrollment.status === "APROBADO" &&
        enrollment.semesterCode === period &&
        enrollment.course &&
        (enrollment as { source?: string }).source !== "MANUAL"
    )
    .reduce(
      (total, enrollment) => total + enrollment.course!.credits,
      0
    )
}

function getFailedEnrollmentsForPeriod(
  enrollments: VerificationProfile["enrollments"],
  period: string
) {
  return enrollments.filter(
    (enrollment) =>
      enrollment.status === "REPROBADO" &&
      enrollment.semesterCode === period
  )
}

function getApprovedCourseData(
  enrollments: VerificationProfile["enrollments"]
): {
  approvedByCourse: Map<string, number>
  approvedCredits: number
  approvedCourseIds: ReadonlySet<string>
} {
  const approvedByCourse = buildApprovedCredits(enrollments)
  const approvedCredits = Array.from(approvedByCourse.values()).reduce(
    (total, credits) => total + credits,
    0
  )

  return {
    approvedByCourse,
    approvedCredits,
    approvedCourseIds: new Set(approvedByCourse.keys()),
  }
}

const verifiers: Record<string, VerificationHandler> = {
  RACHA_7_DIAS_ACCESO: async (context) => {
    const { prisma } = await import("@/lib/prisma")

    const accesses = await prisma.activity.findMany({
      where: {
        userId: context.userId,
        OR: [
          { action: "LOGIN" },
          { action: "PAGE_VIEW:/dashboard" },
          { action: "ACADEMIC_DAILY_ACTIVITY" },
        ],
      },
      select: { createdAt: true },
      orderBy: { createdAt: "desc" },
    })

    const streak = computeConsecutiveAccessStreak(accesses)

    if (streak >= ACCESS_STREAK_TARGET) {
      return passed(
        `Mantienes una racha de ${streak} días consecutivos de acceso.`
      )
    }

    return failed(
      `Te faltan ${Math.max(
        0,
        ACCESS_STREAK_TARGET - streak
      )} días consecutivos de acceso. Tu racha actual es de ${streak} días.`,
      cappedPercent(streak, ACCESS_STREAK_TARGET)
    )
  },

  COMPLETAR_3_MISIONES_SEMANA: async (context) => {
    const { prisma } = await import("@/lib/prisma")
    const now = new Date()

    const missions = await prisma.studentMission.findMany({
      where: {
        studentId: context.userId,
        status: { in: ["COMPLETADA", "VERIFICADA"] },
        completedAt: {
          not: null,
        },
      },
      select: {
        missionId: true,
        completedAt: true,
      },
    })

    const uniqueCompleted = countUniqueCompletedMissions(
      missions.map((mission) => ({
        missionId: mission.missionId,
        completedAt: mission.completedAt ?? now,
      })),
      now,
      7
    )

    if (uniqueCompleted >= WEEKLY_MISSION_TARGET) {
      return passed(
        `Completaste ${uniqueCompleted} misiones distintas en los últimos 7 días.`
      )
    }

    const remaining = Math.max(
      0,
      WEEKLY_MISSION_TARGET - uniqueCompleted
    )

    return failed(
      `Necesitas completar ${remaining} misión(es) más en la última semana (llevas ${uniqueCompleted} de 3).`,
      cappedPercent(uniqueCompleted, WEEKLY_MISSION_TARGET)
    )
  },

  SIN_NOTIFICACIONES_PENDIENTES: async (context) => {
    const { prisma } = await import("@/lib/prisma")

    const pendingNotifications = await prisma.notification.count({
      where: {
        userId: context.userId,
        isRead: false,
      },
    })

    if (pendingNotifications === 0) {
      return passed("No tienes notificaciones pendientes por revisar.")
    }

    return failed(
      `Todavía tienes ${pendingNotifications} notificación(es) sin leer.`,
      Math.max(0, 100 - pendingNotifications * 25)
    )
  },

  APROBAR_CREDITOS_SEMESTRE: (context) => {
    const target = Number(context.verificationValue) || 0
    const approvedInPeriod = getApprovedCreditsForPeriod(
      context.profile.enrollments,
      context.currentPeriod
    )

    if (approvedInPeriod >= target) {
      return passed(
        `Aprobaste ${approvedInPeriod} de ${target} créditos este semestre.`
      )
    }

    return failed(
      `Aún te faltan ${Math.max(
        0,
        target - approvedInPeriod
      )} créditos aprobados este semestre (llevas ${approvedInPeriod} de ${target}).`,
      cappedPercent(approvedInPeriod, target)
    )
  },

  MEJORAR_PROMEDIO: (context) => {
    const improvement = Number(context.verificationValue) || 0.5
    const currentAverage = getAverageGrade(
      context.profile.academicHistory,
      context.profile.enrollments,
      context.profile.averageGrade
    )
    const initialAverage = parseInitialAverage(
      context.metadata,
      context.profile.averageGrade
    )
    const target = Number(
      (initialAverage + improvement).toFixed(2)
    )

    if (currentAverage >= target) {
      return passed(
        `Tu promedio subió de ${initialAverage.toFixed(
          2
        )} a ${currentAverage.toFixed(2)} (meta: ${target.toFixed(2)}).`
      )
    }

    return failed(
      `Tu promedio es ${currentAverage.toFixed(
        2
      )} y debes llegar a ${target.toFixed(
        2
      )} (${improvement} puntos más que tu línea base de ${initialAverage.toFixed(
        2
      )}).`
    )
  },

  CERO_REPROBADOS: (context) => {
    const failedInPeriod = getFailedEnrollmentsForPeriod(
      context.profile.enrollments,
      context.currentPeriod
    )

    if (failedInPeriod.length === 0) {
      return passed(
        "No registras materias reprobadas en el semestre actual."
      )
    }

    return failed(
      `Registras ${failedInPeriod.length} materia(s) reprobada(s) este semestre.`
    )
  },

  COMPLETAR_PREREQUISITOS: async (context) => {
    const { prisma } = await import("@/lib/prisma")
    const courseCode = context.verificationValue

    if (!courseCode) {
      return failed("Falta el curso de referencia de la misión.")
    }

    const course = await prisma.course.findUnique({
      where: { code: courseCode },
      include: { prerequisites: true },
    })

    if (!course) {
      return failed(
        `El curso de referencia ${courseCode} no existe.`
      )
    }

    const prerequisites = course.prerequisites.map(
      (prerequisite) => prerequisite.prerequisiteId
    )

    if (prerequisites.length === 0) {
      return passed(
        `${course.code} no tiene prerrequisitos pendientes.`,
        100
      )
    }

    const missing = prerequisites.filter(
      (id) => !context.approvedCourseIds.has(id)
    )
    const completed = prerequisites.length - missing.length

    if (missing.length === 0) {
      return passed(
        `Completaste todos los prerrequisitos de ${course.code} (${course.name}).`
      )
    }

    return failed(
      `Faltan ${missing.length} prerrequisito(s) de ${course.code}: ${
        missing.length > 0 ? "aún no aprobados" : ""
      }.`,
      Math.round((completed / prerequisites.length) * 100)
    )
  },

  AVANZAR_SEMESTRE: (context) => {
    const required =
      context.profile.currentSemester * CREDITS_PER_SEMESTER

    if (context.approvedCredits >= required) {
      return passed(
        `Acumulas ${context.approvedCredits} créditos aprobados (necesitas ${required} para avanzar del semestre ${context.profile.currentSemester}).`
      )
    }

    return failed(
      `Para avanzar del semestre ${context.profile.currentSemester} necesitas ${required} créditos aprobados y llevas ${context.approvedCredits}.`,
      cappedPercent(context.approvedCredits, required)
    )
  },
}

export async function verifyMission(
  mission: {
    verificationKey: string | null
    verificationValue: string | null
  },
  userId: string,
  metadata: string | null,
  profile: VerificationProfile
): Promise<VerificationResult> {
  const key = mission.verificationKey
  const handler = key ? verifiers[key] : undefined

  if (!handler) {
    return passed("Cumplimiento registrado automáticamente.")
  }

  const {
    approvedCredits,
    approvedCourseIds,
  } = getApprovedCourseData(profile.enrollments)

  return handler({
    userId,
    verificationValue: mission.verificationValue,
    metadata: metadata ?? null,
    currentPeriod: getCurrentPeriod(),
    profile,
    approvedCredits,
    approvedCourseIds,
  })
}