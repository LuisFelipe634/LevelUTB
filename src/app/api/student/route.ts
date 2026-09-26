import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAverageGrade, getCurrentSemester } from "@/lib/academic"
import { calculateStreak } from "@/lib/streak"
import { normalizeMeritcoinStudentId } from "@/lib/meritcoin"
import { recordDailyAcademicActivity } from "@/lib/activity"
import { requireRole, jsonUnauthorized, jsonForbidden } from "@/lib/session"
import { getAcademicSource, isExternalAcademicEnabled } from "@/lib/getAcademicSource"
import type { AcademicEnrollment } from "@/lib/academicSource"

type Resolved<T> = { value: T } | { error: NextResponse }

type AcademicData = {
  enrollments: AcademicEnrollment[]
  academicHistory: {
    grade: number | null
    status?: string
    source?: string
    credits?: number
    course?: { credits?: number }
  }[]
}

type LevelRow = { number: number; name: string; minPoints: number }

type LinkUpdate = { walletAddress?: string | null; meritcoinStudentId?: string | null }

type StudentLink = { walletAddress: string | null; meritcoinStudentId: string | null }

const WALLET_RE = /^0x[a-fA-F0-9]{40}$/

// Sesión de estudiante: compartida por GET y PATCH para no duplicar el 401/403.
async function requireStudentUserId(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await requireRole("STUDENT")

  if (session.error) {
    return {
      error: session.status === 401 ? jsonUnauthorized(session.error) : jsonForbidden(session.error),
    }
  }

  const userId = session.data?.userId
  if (!userId) {
    return { error: jsonUnauthorized("No autorizado") }
  }

  return { userId }
}

async function recordTodayAcademicActivity(userId: string): Promise<void> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const todayActivity = await prisma.activity.findFirst({
    where: { userId, action: "ACADEMIC_DAILY_ACTIVITY", createdAt: { gte: todayStart } },
  })

  if (!todayActivity) {
    await recordDailyAcademicActivity(userId, "student_profile")
  }
}

// Fuente académica desacoplada: si UNIVERSITY_API_ENABLED=true usa HTTP externa,
// sino Prisma local. Si la externa no está disponible se corta con 503 en vez de
// servir datos parciales.
async function fetchExternalAcademicData(userId: string): Promise<Resolved<AcademicData | null>> {
  if (!isExternalAcademicEnabled()) return { value: null }

  try {
    const source = getAcademicSource()
    const data = await source.getStudentAcademicData(userId)
    if (!data.profile) return { value: null }

    return { value: { enrollments: data.profile.enrollments, academicHistory: [] } }
  } catch (e) {
    if (e instanceof Error && e.message === "EXTERNAL_API_UNAVAILABLE") {
      return {
        error: NextResponse.json({ error: "Fuente académica externa no disponible" }, { status: 503 }),
      }
    }
    throw e
  }
}

function resolveLevels(levels: LevelRow[], totalPoints: number) {
  let currentLevel = levels[0]
  let nextLevel = levels[1]

  for (let i = levels.length - 1; i >= 0; i--) {
    if (totalPoints >= levels[i].minPoints) {
      currentLevel = levels[i]
      nextLevel = levels[i + 1] || null
      break
    }
  }

  return { currentLevel, nextLevel }
}

export async function GET() {
  function currentPeriod() {
    const now = new Date()
    return `${now.getFullYear()}-${now.getMonth() < 6 ? 1 : 2}`
  }

  try {
    const session = await requireStudentUserId()
    if ("error" in session) return session.error

    const userId = session.userId
    await recordTodayAcademicActivity(userId)

    const external = await fetchExternalAcademicData(userId)
    if ("error" in external) return external.error
    const academicEnrollmentsData = external.value

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        studentProfile: {
          include: {
            program: true,
            enrollments: {
              include: { course: { include: { semester: true } } }
            },
            academicHistory: true,
            recommendations: true
          }
        },
        points: true,
        missions: {
          include: {
            mission: true
          }
        },
        badges: {
          include: {
            badge: true
          }
        },
        notifications: {
          where: { isRead: false },
          orderBy: { createdAt: "desc" },
          take: 5
        },
        activities: {
          orderBy: { createdAt: "desc" },
          take: 10
        }
      }
    })

    if (!user) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 })
    }

    // Override enrollments/program si viene de externa (sin modificar BD)
    const effectiveEnrollments = academicEnrollmentsData ? academicEnrollmentsData.enrollments : user.studentProfile?.enrollments || []
    const effectiveAcademicHistory = academicEnrollmentsData ? academicEnrollmentsData.academicHistory : user.studentProfile?.academicHistory || []

    // Calcular puntos totales
    const totalPoints = user.points.reduce((acc, p) => acc + p.amount, 0)
    const streakActivities = await prisma.activity.findMany({ where: { userId, action: "ACADEMIC_DAILY_ACTIVITY" }, select: { createdAt: true }, orderBy: { createdAt: "desc" } })

    // Obtener nivel actual
    const levels = await prisma.level.findMany({
      orderBy: { number: "asc" }
    })

    const { currentLevel, nextLevel } = resolveLevels(levels, totalPoints)

    // Calcular misiones activas y completadas
    const activeMissions = user.missions.filter(
      (m) => m.status === "EN_PROGRESO" || m.status === "PENDIENTE"
    )
    const completedMissions = user.missions.filter(
      (m) => m.status === "COMPLETADA" || m.status === "VERIFICADA"
    )

    const approvedCredits = Array.from(new Map(
      effectiveEnrollments
        .filter((enrollment) => enrollment.status === "APROBADO")
        .map((enrollment) => [enrollment.courseId, enrollment.course.credits]) || []
    ).values()).reduce((total, credits) => total + credits, 0)
    const currentSemester = getCurrentSemester(effectiveEnrollments, user.studentProfile?.currentSemester || 1, currentPeriod())
    const averageGrade = user.studentProfile
      ? getAverageGrade(effectiveAcademicHistory as Parameters<typeof getAverageGrade>[0], effectiveEnrollments as Parameters<typeof getAverageGrade>[1], user.studentProfile.averageGrade)
      : 0

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role
      },
      profile: user.studentProfile ? { ...user.studentProfile, averageGrade, currentSemester, totalCredits: approvedCredits } : null,
      stats: {
        totalPoints,
        currentLevel: currentLevel?.name || "Novato",
        currentLevelNumber: currentLevel?.number || 1,
        nextLevel: nextLevel?.name || null,
        nextLevelPoints: nextLevel?.minPoints || 0,
        pointsToNextLevel: nextLevel ? nextLevel.minPoints - totalPoints : 0,
        activeMissionsCount: activeMissions.length,
        completedMissionsCount: completedMissions.length,
        badgesCount: user.badges.length,
        streak: calculateStreak(streakActivities)
      },
      missions: user.missions.map((m) => ({
        id: m.id,
        title: m.mission.title,
        description: m.mission.description,
        type: m.mission.type,
        points: m.mission.pointsReward,
        progress: m.progress,
        status: m.status,
        completedAt: m.completedAt
      })),
      recentBadges: user.badges.slice(0, 5).map((b) => ({
        id: b.badge.id,
        name: b.badge.name,
        icon: b.badge.iconUrl,
        earned: b.earnedAt
      })),
      notifications: user.notifications,
      unreadCount: await prisma.notification.count({
        where: {
          userId: user.id as string,
          isRead: false
        }
      })
    })
  } catch (error) {
    console.error("Error fetching student data:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// Un campo del vínculo viene "presente" si el cliente lo envió con valor.
// "" y null significan "desvincular", así que no se validan.
function isPresent(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
}

function validateLinkField(
  value: unknown,
  error: string,
  isValid: (raw: string) => boolean
): NextResponse | null {
  if (!isPresent(value)) return null

  if (typeof value !== "string" || !isValid(value.trim())) {
    return NextResponse.json({ error }, { status: 400 })
  }

  return null
}

function buildLinkUpdate(walletAddress: unknown, meritcoinStudentId: unknown): LinkUpdate {
  const data: LinkUpdate = {}

  if (walletAddress !== undefined) {
    data.walletAddress = !walletAddress ? null : (walletAddress as string).trim()
  }
  if (meritcoinStudentId !== undefined) {
    data.meritcoinStudentId = !meritcoinStudentId
      ? null
      : normalizeMeritcoinStudentId(meritcoinStudentId as string)
  }

  return data
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: string }).code === "P2002"
  )
}

async function saveStudentLink(userId: string, data: LinkUpdate): Promise<Resolved<StudentLink>> {
  try {
    const profile = await prisma.studentProfile.update({
      where: { userId },
      data,
      select: { walletAddress: true, meritcoinStudentId: true },
    })

    return {
      value: { walletAddress: profile.walletAddress, meritcoinStudentId: profile.meritcoinStudentId },
    }
  } catch (error) {
    // meritcoinStudentId es @unique: choca cuando otra cuenta ya lo usa.
    if (isUniqueConstraintError(error)) {
      return {
        error: NextResponse.json(
          { error: "Ese ID de Meritcoin (STU-x) ya está vinculado a otro estudiante" },
          { status: 409 }
        ),
      }
    }
    throw error
  }
}

// PATCH: Actualizar el vínculo con Meritcoin del estudiante
// (wallet Ethereum y/o ID de estudiante en Meritcoin/Moodle)
export async function PATCH(request: Request) {
  try {
    const session = await requireStudentUserId()
    if ("error" in session) return session.error

    const { userId } = session
    const body = (await request.json()) as { walletAddress?: unknown; meritcoinStudentId?: unknown }
    const { walletAddress, meritcoinStudentId } = body

    const invalidField =
      validateLinkField(
        walletAddress,
        "Dirección de wallet inválida (formato 0x + 40 caracteres hexadecimales)",
        (raw) => WALLET_RE.test(raw)
      ) ??
      validateLinkField(
        meritcoinStudentId,
        "ID de Meritcoin inválido (usa formato STU-3 o el número de Moodle)",
        (raw) => normalizeMeritcoinStudentId(raw) !== null
      )
    if (invalidField) return invalidField

    const saved = await saveStudentLink(userId, buildLinkUpdate(walletAddress, meritcoinStudentId))
    if ("error" in saved) return saved.error

    return NextResponse.json(saved.value)
  } catch (error) {
    console.error("Error updating wallet:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
