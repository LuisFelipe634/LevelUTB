import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { getMeritcoinBalance, resolveCustodialWallet, syncMeritcoinAwardsByStudentId, syncMeritcoinBadges, syncMeritcoinTemplates } from "@/lib/meritcoin"

type WalletOwner = { walletAddress: string | null; meritcoinStudentId: string | null }

type MeritcoinState = { connected: boolean; balanceMrt: number | null }

type BadgeRow = {
  id: string
  name: string
  description: string
  iconUrl: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
  externalId: string | null
}

type EarnedBadgeRow = {
  badgeId: string
  earnedAt: Date | null
  evidence: string | null
  verifiedBy: string | null
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
  source: "MERITCOIN" | "LOCAL"
}

// Catálogo de insignias reales de Meritcoin (no requiere wallet).
// Si su backend está caído, se muestran las ya reflejadas localmente.
async function syncTemplateCatalog(): Promise<boolean> {
  try {
    const result = await syncMeritcoinTemplates()
    return result.connected
  } catch (error) {
    console.error("Error sincronizando plantillas Meritcoin:", error)
    return false
  }
}

// Si hay STU-x pero no wallet, se resuelve la custodial (lookup + provision) y se guarda.
async function loadWalletOwner(userId: string): Promise<WalletOwner> {
  const walletOwner = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { walletAddress: true, meritcoinStudentId: true },
  })

  if (!walletOwner?.meritcoinStudentId || walletOwner.walletAddress) {
    return walletOwner ?? { walletAddress: null, meritcoinStudentId: null }
  }

  const resolved = await resolveCustodialWallet(userId, walletOwner.meritcoinStudentId)
  if (resolved) walletOwner.walletAddress = resolved.walletAddress

  return walletOwner
}

// + awards por ID (funciona sin wallet y la auto-importa).
async function syncAwardsByStudentId(
  userId: string,
  meritcoinStudentId: string,
  walletOwner: WalletOwner,
): Promise<boolean> {
  const idResult = await syncMeritcoinAwardsByStudentId(userId, meritcoinStudentId)

  // Si se importó la wallet, recargar para el sync por wallet
  if (idResult.walletImported) {
    const refreshed = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { walletAddress: true },
    })
    if (refreshed?.walletAddress) walletOwner.walletAddress = refreshed.walletAddress
  }

  return idResult.connected
}

async function syncBadgesByWallet(userId: string, walletAddress: string): Promise<MeritcoinState> {
  const result = await syncMeritcoinBadges(userId, walletAddress)
  if (!result.connected) return { connected: false, balanceMrt: null }

  return { connected: true, balanceMrt: await getMeritcoinBalance(walletAddress) }
}

// Reflejar insignias on-chain ganadas por el estudiante.
// Adaptado a Meritcoin: la llave es meritcoinStudentId (STU-{id}).
async function syncStudentMeritcoin(userId: string, templatesConnected: boolean): Promise<MeritcoinState> {
  const state: MeritcoinState = { connected: templatesConnected, balanceMrt: null }

  try {
    const walletOwner = await loadWalletOwner(userId)

    if (walletOwner.meritcoinStudentId) {
      const connected = await syncAwardsByStudentId(userId, walletOwner.meritcoinStudentId, walletOwner)
      state.connected = connected || state.connected
    }

    if (walletOwner.walletAddress) {
      const byWallet = await syncBadgesByWallet(userId, walletOwner.walletAddress)
      state.connected = byWallet.connected || state.connected
      state.balanceMrt = byWallet.balanceMrt
    }
  } catch (error) {
    console.error("Error sincronizando insignias Meritcoin:", error)
  }

  return state
}

function buildBadgeViews(allBadges: BadgeRow[], earnedBadges: EarnedBadgeRow[]): BadgeView[] {
  return allBadges.map((badge) => {
    const earned = earnedBadges.find((eb) => eb.badgeId === badge.id)
    const fromMeritcoin = earned?.verifiedBy === "MERITCOIN" || badge.externalId?.startsWith("MERIT-")

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
      source: fromMeritcoin ? "MERITCOIN" : "LOCAL",
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

    const templatesConnected = await syncTemplateCatalog()
    const meritcoin = await syncStudentMeritcoin(userId, templatesConnected)

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
      },
      meritcoin: { connected: meritcoin.connected, balanceMrt: meritcoin.balanceMrt }
    })
  } catch (error) {
    console.error("Error fetching badges:", error)
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
