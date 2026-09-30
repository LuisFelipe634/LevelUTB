import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

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

async function syncBadges() {
  console.log('🔄 Sincronizando insignias desde fixtures locales...')

  console.log(`📚 Catálogo v${badgeFixtures.catalogVersion} (${badgeFixtures.badges.length} insignias)`)

  // 1. Upsert insignias en BD local
  const badgeIdByCode = new Map<string, string>()

  for (const badge of badgeFixtures.badges) {
    // Usar el nombre como identificador (el schema no tiene campo code único)
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
      badgeIdByCode.set(badge.code, existing.id)
    } else {
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
      badgeIdByCode.set(badge.code, created.id)
    }
    console.log(`  ✅ ${badge.code}: ${badge.name}`)
  }

  // 2. Get all student profiles from local DB to sync
  const profiles = await prisma.studentProfile.findMany({
    select: { id: true, userId: true, studentCode: true },
  })

  console.log(`👥 Sincronizando insignias para ${profiles.length} estudiantes...`)

  for (const profile of profiles) {
    try {
      const studentBadges = badgeFixtures.studentBadges[profile.studentCode] ?? []

      for (const earnedBadge of studentBadges) {
        const badgeId = badgeIdByCode.get(earnedBadge.code)
        if (!badgeId) {
          console.warn(`  ⚠️  Badge ${earnedBadge.code} no encontrado en catálogo local`)
          continue
        }

        const earnedAt = earnedBadge.earnedAt ? new Date(earnedBadge.earnedAt) : new Date()

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