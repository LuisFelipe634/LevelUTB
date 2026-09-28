import type { BadgeCatalog, BadgeRecord, BadgeSource } from "@/lib/badgeSource"

// Cliente HTTP del catalogo de insignias institucional. Apunta a utb-external-api
// hoy y a la API real de la UTB cuando exista; el contrato de la respuesta es
// el que define que no haya que tocar el consumidor.
//
// A diferencia de httpAcademicSource.ts, un fallo NO devuelve null: lanza
// EXTERNAL_API_UNAVAILABLE para que la ruta decida degradar a Prisma y no
// servir un catalogo vacio como si fuera el respuesta real.

const BADGE_CATALOG_TIMEOUT_MS = 5000

export class ExternalApiUnavailableError extends Error {
  constructor(message = "EXTERNAL_API_UNAVAILABLE") {
    super(message)
    this.name = "ExternalApiUnavailableError"
  }
}

function getBaseUrl(): string {
  return (process.env.UNIVERSITY_API_URL || "http://localhost:3001").replace(/\/$/, "")
}

function getApiKey(): string | undefined {
  return process.env.UNIVERSITY_API_KEY || process.env.API_KEY || undefined
}

type ExternalBadgePayload = {
  code: string
  name: string
  description: string
  iconUrl: string
  category: string
  requiredLevel: number | null
  pointsRequired: number | null
  earned: boolean
  earnedAt: string | null
  evidence: string | null
}

type ExternalBadgesResponse = {
  catalogVersion?: string
  badges: ExternalBadgePayload[]
}

export class HttpBadgeSource implements BadgeSource {
  async getStudentBadges(studentCode: string): Promise<BadgeCatalog> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), BADGE_CATALOG_TIMEOUT_MS)

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      const key = getApiKey()
      if (key) headers["x-api-key"] = key

      const res = await fetch(
        `${getBaseUrl()}/academic/students/${encodeURIComponent(studentCode)}/badges`,
        { signal: controller.signal, cache: "no-store", headers }
      )

      // 404 = el estudiante no existe en la fuente externa. No es una caida del
      // servicio, asi que se distingue del resto para no degradar en silencio.
      if (res.status === 404) {
        throw new Error(`EXTERNAL_BADGES_STUDENT_NOT_FOUND:${studentCode}`)
      }

      if (!res.ok) {
        console.error(`[httpBadgeSource] catalogo de insignias -> ${res.status}`)
        throw new ExternalApiUnavailableError()
      }

      const payload = (await res.json()) as ExternalBadgesResponse
      if (!Array.isArray(payload?.badges)) {
        console.error("[httpBadgeSource] respuesta sin campo badges")
        throw new ExternalApiUnavailableError()
      }

      const badges: BadgeRecord[] = payload.badges.map((badge) => ({
        code: badge.code,
        name: badge.name,
        description: badge.description,
        iconUrl: badge.iconUrl,
        category: badge.category,
        requiredLevel: badge.requiredLevel ?? null,
        pointsRequired: badge.pointsRequired ?? null,
        earned: badge.earned,
        earnedAt: badge.earnedAt,
        evidence: badge.evidence ?? null,
      }))

      return { badges, source: "http", catalogVersion: payload.catalogVersion ?? null }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("EXTERNAL_BADGES_STUDENT_NOT_FOUND")) {
        throw error
      }
      console.error(
        "[httpBadgeSource] fallo consultando insignias:",
        error instanceof Error ? error.message : error
      )
      throw new ExternalApiUnavailableError()
    } finally {
      clearTimeout(timer)
    }
  }
}
