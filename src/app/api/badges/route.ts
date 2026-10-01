import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import type { BadgeCatalog } from "@/lib/badgeSource"
import { PrismaBadgeSource } from "@/lib/prismaBadgeSource"
import { isExternalBadgesEnabled, isExternalStudentNotFound, getBadgeSource } from "@/lib/getBadgeSource"

type BadgeStats = {
  total: number
  earned: number
  percentage: number
  byCategory: Record<string, { total: number; earned: number }>
}

type SummarizableBadge = { category: string; earned: boolean }

function summarizeByCategory(badges: SummarizableBadge[]) {
  return badges.reduce((acc, badge) => {
    const bucket = (acc[badge.category] ??= { total: 0, earned: 0 })
    bucket.total++
    if (badge.earned) bucket.earned++
    return acc
  }, {} as Record<string, { total: number; earned: number }>)
}

function buildStats(badges: SummarizableBadge[]): BadgeStats {
  const total = badges.length
  const earned = badges.filter((b) => b.earned).length

  return {
    total,
    earned,
    percentage: total > 0 ? Math.round((earned / total) * 100) : 0,
    byCategory: summarizeByCategory(badges),
  }
}

async function loadCatalog(studentCode: string): Promise<BadgeCatalog & { degraded: boolean }> {
  const source = getBadgeSource()

  if (!isExternalBadgesEnabled()) {
    return { ...(await source.getStudentBadges(studentCode)), degraded: false }
  }

  try {
    return { ...(await source.getStudentBadges(studentCode)), degraded: false }
  } catch (error) {
    if (isExternalStudentNotFound(error)) {
      // Sin registro en la fuente externa: catalogo vacio es la respuesta
      // correcta, no una caida.
      console.warn(`[api/badges] estudiante no encontrado en la fuente externa: ${studentCode}`)
      return { badges: [], source: "http", catalogVersion: null, degraded: false }
    }

    console.error("[api/badges] fuente externa de insignias no disponible, degrado a local")
    const local = await new PrismaBadgeSource().getStudentBadges(studentCode)
    return { ...local, degraded: true }
  }
}

export async function GET() {
  try {
    const session = await auth()

    if (!session?.user?.id) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }

    // El catalogo externo se indexa por studentCode; la identidad sigue en Prisma.
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: session.user.id as string },
      select: { studentCode: true },
    })

    if (!profile) {
      return NextResponse.json({ error: "Perfil de estudiante no encontrado" }, { status: 404 })
    }

    const catalog = await loadCatalog(profile.studentCode)
    const badges = catalog.badges.map((badge) => ({
      id: badge.code,
      name: badge.name,
      description: badge.description,
      icon: badge.iconUrl,
      category: badge.category,
      requiredLevel: badge.requiredLevel,
      pointsRequired: badge.pointsRequired,
      progress: null,
      earned: badge.earned,
      earnedAt: badge.earnedAt,
      evidence: badge.evidence,
    }))

    return NextResponse.json({
      badges,
      stats: buildStats(badges),
      origin: {
        source: catalog.source,
        catalogVersion: catalog.catalogVersion,
        degraded: catalog.degraded,
      },
    })
  } catch (error) {
    console.error("Error fetching badges:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
