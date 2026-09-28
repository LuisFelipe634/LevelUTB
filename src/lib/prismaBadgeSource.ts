import { prisma } from "@/lib/prisma"
import type { BadgeCatalog, BadgeRecord, BadgeSource } from "@/lib/badgeSource"

// Origen de insignias sobre Prisma: el catalogo sembrado en prisma/seed.ts
// (BADGES_DATA) mas lo que cada estudiante tiene en StudentBadge.
export class PrismaBadgeSource implements BadgeSource {
  async getStudentBadges(studentCode: string): Promise<BadgeCatalog> {
    const profile = await prisma.studentProfile.findUnique({
      where: { studentCode },
      // StudentBadge.studentId referencia User.id, no StudentProfile.id.
      select: { userId: true },
    })

    if (!profile) return { badges: [], source: "prisma", catalogVersion: null }

    const [allBadges, earnedBadges] = await Promise.all([
      prisma.badge.findMany({
        where: { isActive: true },
        orderBy: [{ category: "asc" }, { name: "asc" }],
      }),
      prisma.studentBadge.findMany({
        where: { studentId: profile.userId },
        select: { badgeId: true, earnedAt: true, evidence: true },
      }),
    ])

    const earnedByBadgeId = new Map(earnedBadges.map((b) => [b.badgeId, b]))

    const badges: BadgeRecord[] = allBadges.map((badge) => {
      const earned = earnedByBadgeId.get(badge.id)
      return {
        code: badge.id,
        name: badge.name,
        description: badge.description,
        iconUrl: badge.iconUrl,
        category: badge.category,
        requiredLevel: badge.requiredLevel,
        pointsRequired: badge.pointsRequired,
        earned: !!earned,
        earnedAt: earned?.earnedAt ?? null,
        evidence: earned?.evidence ?? null,
      }
    })

    return { badges, source: "prisma", catalogVersion: null }
  }
}
