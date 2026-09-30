import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getGetStudentRewardsUseCase, getRedeemRewardUseCase, getCurrentPeriod } from "@/application/rewards/rewardFactory"

type StudentSession = { userId: string } | { error: NextResponse }

async function requireStudentSession(): Promise<StudentSession> {
  const session = await auth()

  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  }

  if (session.user.role !== "STUDENT") {
    return {
      error: NextResponse.json(
        { error: "Solo los estudiantes pueden acceder a recompensas" },
        { status: 403 }
      ),
    }
  }

  return { userId: session.user.id as string }
}

function devError(error: string, cause: unknown): NextResponse | null {
  if (process.env.NODE_ENV !== "development") return null
  return NextResponse.json(
    { error, details: cause instanceof Error ? cause.message : String(cause) },
    { status: 500 }
  )
}

export async function GET() {
  try {
    const session = await requireStudentSession()
    if ("error" in session) return session.error

    const { userId } = session
    const period = getCurrentPeriod()

    const getStudentRewardsUseCase = getGetStudentRewardsUseCase()
    const result = await getStudentRewardsUseCase.execute(userId, period)

    return NextResponse.json({
      rewards: result.rewards.map((reward) => {
        const studentReward = result.studentRewards.find((sr) => sr.rewardId === reward.id)
        const usesCount = result.studentRewards.filter((sr) => sr.rewardId === reward.id && sr.status !== "RECHAZADO").length
        const canUse = reward.maxUses === null || usesCount < reward.maxUses

        return {
          id: reward.id,
          name: reward.name,
          description: reward.description,
          icon: reward.icon,
          category: reward.category,
          cost: reward.cost,
          maxUses: reward.maxUses,
          canAfford: result.totalPoints >= reward.cost,
          canUse,
          usesCount,
          earned: studentReward ? {
            id: studentReward.id,
            status: studentReward.status,
            pointsSpent: studentReward.pointsSpent,
            requestedAt: studentReward.requestedAt.toISOString(),
            reviewedAt: studentReward.reviewedAt?.toISOString() || null,
            reviewNote: studentReward.reviewNote,
            expiresAt: studentReward.expiresAt?.toISOString() || null,
            course: {
              id: studentReward.course.id,
              code: studentReward.course.code,
              name: studentReward.course.name,
              semester: studentReward.course.semester.number,
            },
          } : null,
        }
      }),
      enrolledCourses: result.enrolledCourses,
      currentPeriod: period,
      stats: {
        ...result.stats,
        totalPoints: result.totalPoints,
      },
    })
  } catch (error) {
    console.error("Error fetching rewards:", error)
    const response = devError("Error interno del servidor", error)
    if (response) return response
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireStudentSession()
    if ("error" in session) return session.error

    const { userId } = session
    const body = await request.json()
    const { rewardId, courseId, evidence } = body as { rewardId: string; courseId?: string; evidence?: string }

    if (!rewardId || !courseId) {
      return NextResponse.json({ error: "Debes seleccionar el curso objetivo" }, { status: 400 })
    }

    const redeemRewardUseCase = getRedeemRewardUseCase()
    const result = await redeemRewardUseCase.execute(userId, { rewardId, courseId, evidence })

    return NextResponse.json({ studentReward: result.studentReward })
  } catch (error) {
    console.error("Error redeeming reward:", error)

    if (error instanceof Error) {
      switch (error.message) {
        case "REWARD_NOT_FOUND":
          return NextResponse.json({ error: "Recompensa no encontrada o inactiva" }, { status: 404 })
        case "INELIGIBLE_COURSE": {
          const period = getCurrentPeriod()
          return NextResponse.json(
            { error: `Solo puedes reclamar la recompensa para un curso matriculado oficialmente en el semestre actual del periodo ${period}. Verifica tus cursos vigentes en /malla.` },
            { status: 400 }
          )
        }
        case "MAX_USES_REACHED":
          return NextResponse.json({ error: "Has alcanzado el límite de usos para esta recompensa" }, { status: 400 })
        case "INSUFFICIENT_POINTS":
          return NextResponse.json({ error: "Puntos insuficientes" }, { status: 400 })
        case "PENDING_REQUEST_EXISTS":
          return NextResponse.json({ error: "Ya tienes una solicitud pendiente para esta recompensa" }, { status: 400 })
      }
    }

    const response = devError("Error interno del servidor", error)
    if (response) return response
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}