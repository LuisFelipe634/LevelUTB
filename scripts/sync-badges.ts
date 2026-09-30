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
const badgeFixtures = JSON.parse(readFileSync(badgeFixturesPath, 'utf-8')) as {
  catalogVersion: string
  issuer: string
  badges: Array<{
    code: string
    name: string
    description: string
    iconUrl: string
    category: string
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
        category: badge.category as any,
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
      category: badge.category as any,
      requiredLevel: badge.requiredLevel,
      pointsRequired: badge.pointsRequired,
    },
  })
  return created.id
}

async function syncStudentBadges(profile: { userId: string; studentCode: string }, badgeIdByCode: Map<string, string>) {
  const studentBadges = badgeFixtures.studentBadges[profile.studentCode] ?? []

  for (const earnedBadge of studentBadges) {
    const badgeId = badgeIdByCode.get(earnedBadge.code)
    if (!badgeId) {
      console.warn(`  ⚠️  Badge ${earnedBadge.code} no encontrado en catálogo local`)
      continue
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
  }
}

async function syncBadges() {
  console.log('🔄 Sincronizando insignias desde fixtures locales...')
  console.log(`📚 Catálogo v${badgeFixtures.catalogVersion} (${badgeFixtures.badges.length} insignias)`)

  const badgeIdByCode = new Map<string, string>()

  for (const badge of badgeFixtures.badges) {
    const badgeId = await upsertBadge(badge)
    badgeIdByCode.set(badge.code, badgeId)
    console.log(`  ✅ ${badge.code}: ${badge.name}`)
  }

  const profiles = await prisma.studentProfile.findMany({
    select: { id: true, userId: true, studentCode: true },
  })

  console.log(`👥 Sincronizando insignias para ${profiles.length} estudiantes...`)

  for (const profile of profiles) {
    try {
      await syncStudentBadges(profile, badgeIdByCode)
    } catch (error) {
      console.error(`  ❌ Error sincronizando ${profile.studentCode}:`, error instanceof Error ? error.message : error)
    }
  }

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