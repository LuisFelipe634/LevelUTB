import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"

type BadgeRow = {
  id: string
  name: string
  description: string
  iconUrl: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
}

type EarnedBadgeRow = {
  badgeId: string
  earnedAt: Date | null
  evidence: string | null
}

type BadgeView = {
  id: string
  name: string
  description: string
  icon: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
  progress: null
  earned: boolean
  earnedAt: Date | null
  evidence: string | null
}

function buildBadgeViews(allBadges: BadgeRow[], earnedBadges: EarnedBadgeRow[]): BadgeView[] {
  return allBadges.map((badge) => {
    const earned = earnedBadges.find((eb) => eb.badgeId === badge.id)

    return {
      id: badge.id,
      name: badge.name,
      description: badge.description,
      icon: badge.iconUrl,
      category: badge.category,
      requiredLevel: badge.requiredLevel,
      pointsRequired: badge.pointsRequired,
      progress: null,
      earned: !!earned,
      earnedAt: earned?.earnedAt || null,
      evidence: earned?.evidence || null,
    }
  })
}

function summarizeByCategory(badges: BadgeView[]) {
  return badges.reduce((acc, badge) => {
    const bucket = (acc[badge.category] ??= { total: 0, earned: 0 })
    bucket.total++
    if (badge.earned) bucket.earned++
    return acc
  }, {} as Record<string, { total: number; earned: number }>)
}

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    const userId = session.user.id as string

    // Obtener todas las insignias disponibles
    const allBadges = await prisma.badge.findMany({
      where: { isActive: true },
      orderBy: { category: "asc" }
    })

    // Obtener insignias que tiene el estudiante
    const earnedBadges = await prisma.studentBadge.findMany({
      where: { studentId: userId },
      include: {
        badge: true
      }
    })

    const badges = buildBadgeViews(allBadges, earnedBadges)
    const totalBadges = badges.length
    const earnedCount = badges.filter((b) => b.earned).length

    return NextResponse.json({
      badges,
      stats: {
        total: totalBadges,
        earned: earnedCount,
        percentage: totalBadges > 0 ? Math.round((earnedCount / totalBadges) * 100) : 0,
        byCategory: summarizeByCategory(badges)
      }
    })
  } catch (error) {
    console.error("Error fetching badges:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
