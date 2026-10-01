import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

export const ACTIVITY_ACTIONS = {
  LOGIN: "LOGIN",
  DASHBOARD_PAGE_VIEW: "PAGE_VIEW:/dashboard",
  DAILY_ACADEMIC: "ACADEMIC_DAILY_ACTIVITY",
  ROUTE_RECOMMENDED_DOCENTE: "RUTA_RECOMENDADA_DOCENTE",
  MISSION_VERIFIED: "MISION_VERIFICADA",
  REWARD_APPROVED: "RECOMPENSA_APROBADA",
  REWARD_REJECTED: "RECOMPENSA_RECHAZADA",
} as const

export type ActivityAction = string

export function recordUserActivity(
  userId: string,
  action: ActivityAction,
  details: Prisma.InputJsonValue = {}
) {
  if (!userId || !action) {
    return null
  }

  return prisma.activity.create({
    data: {
      userId,
      action,
      details: Object.keys(details as Record<string, unknown> || {}).length > 0 ? details : undefined,
    },
  })
}

export function recordDailyAcademicActivity(userId: string, source = "student_profile") {
  return recordUserActivity(userId, ACTIVITY_ACTIONS.DAILY_ACADEMIC, { source })
}

export async function getAccessActivityDates(userId: string) {
  const activities = await prisma.activity.findMany({
    where: {
      userId,
      action: {
        in: [ACTIVITY_ACTIONS.LOGIN, ACTIVITY_ACTIONS.DASHBOARD_PAGE_VIEW],
      },
    },
    select: { createdAt: true },
    orderBy: { createdAt: "desc" },
  })

  return activities.map((activity) => new Date(activity.createdAt))
}
