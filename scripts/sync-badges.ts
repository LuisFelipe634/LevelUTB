import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

// Cargar fixtures locales directamente (más rápido y confiable que HTTP)
const badgeFixturesPath = join(__dirname, 'badges.json')
type BadgeCategory = 'PROGRESO' | 'COMPETENCIA' | 'HABITO' | 'IMPACTO_SOCIAL' | 'RENDIMIENTO'

const badgeFixtures = JSON.parse(readFileSync(badgeFixturesPath, 'utf-8')) as {
  catalogVersion: string
  issuer: string
  badges: Array<{
    code: string
    name: string
    description: string
    iconUrl: string
    category: BadgeCategory
    requiredLevel: number | null
    pointsRequired: number | null
  }>
  studentBadges: Record<string, Array<{
    code: string
    earnedAt: string | null
    evidence: string | null
  }>>
}

function parseEarnedAt(earnedAt: string | null): Date {
  return earnedAt ? new Date(earnedAt) : new Date()
}

async function upsertBadge(badge: typeof badgeFixtures.badges[0]): Promise<string> {
  const existing = await prisma.badge.findFirst({ where: { name: badge.name } })
  if (existing) {
    await prisma.badge.update({
      where: { id: existing.id },
      data: {
        description: badge.description,
        iconUrl: badge.iconUrl,
        category: badge.category,
        requiredLevel: badge.requiredLevel,
        pointsRequired: badge.pointsRequired,
      },
    })
    return existing.id
  }
  const created = await prisma.badge.create({
    data: {
      name: badge.name,
      description: badge.description,
      iconUrl: badge.iconUrl,
      category: badge.category,
      requiredLevel: badge.requiredLevel,
      pointsRequired: badge.pointsRequired,
    },
  })
  return created.id
}

async function syncStudentBadges(profile: { userId: string; studentCode: string }, badgeIdByCode: Map<string, string>) {
  const studentBadges = badgeFixtures.studentBadges[profile.studentCode] ?? []

  await Promise.all(
    studentBadges.map(async (earnedBadge) => {
      const badgeId = badgeIdByCode.get(earnedBadge.code)
      if (!badgeId) {
        console.warn(`  ⚠️  Badge ${earnedBadge.code} no encontrado en catálogo local`)
        return
      }

      const earnedAt = parseEarnedAt(earnedBadge.earnedAt)

      await prisma.studentBadge.upsert({
        where: {
          studentId_badgeId: {
            studentId: profile.userId,
            badgeId,
          },
        },
        update: {
          earnedAt,
          evidence: earnedBadge.evidence,
        },
        create: {
          studentId: profile.userId,
          badgeId,
          earnedAt,
          evidence: earnedBadge.evidence,
        },
      })
      console.log(`  ✅ ${profile.studentCode} - ${earnedBadge.code}`)
    })
  )
}

async function syncBadges() {
  console.log('🔄 Sincronizando insignias desde fixtures locales...')
  console.log(`📚 Catálogo v${badgeFixtures.catalogVersion} (${badgeFixtures.badges.length} insignias)`)

  // El catalogo canonico es scripts/badges.json (8). Se eliminan insignias
  // fuera del fixture para no acumular restos de seeds anteriores.
  const fixtureNames = badgeFixtures.badges.map((b) => b.name)
  const staleBadges = await prisma.badge.findMany({
    where: { name: { notIn: fixtureNames } },
    select: { id: true },
  })
  if (staleBadges.length > 0) {
    const staleIds = staleBadges.map((b) => b.id)
    await prisma.studentBadge.deleteMany({ where: { badgeId: { in: staleIds } } })
    const stale = await prisma.badge.deleteMany({ where: { id: { in: staleIds } } })
    console.log(`🧹 Eliminadas ${stale.count} insignias fuera del catálogo`)
  }

  const badgeIdByCode = new Map<string, string>()

  // Upsert all badges in parallel
  const badgeResults = await Promise.all(
    badgeFixtures.badges.map(async (badge) => {
      const badgeId = await upsertBadge(badge)
      console.log(`  ✅ ${badge.code}: ${badge.name}`)
      return { code: badge.code, id: badgeId }
    })
  )
  badgeResults.forEach(({ code, id }) => badgeIdByCode.set(code, id))

  const profiles = await prisma.studentProfile.findMany({
    select: { id: true, userId: true, studentCode: true },
  })

  console.log(`👥 Sincronizando insignias para ${profiles.length} estudiantes...`)

  // Sync all students in parallel
  await Promise.all(
    profiles.map(async (profile) => {
      try {
        await syncStudentBadges(profile, badgeIdByCode)
      } catch (error) {
        console.error(`  ❌ Error sincronizando ${profile.studentCode}:`, error instanceof Error ? error.message : error)
      }
    })
  )

  console.log('🎉 Sincronización completada')
}

syncBadges()
  .catch((e) => {
    console.error('❌ Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })