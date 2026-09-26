import { prisma } from "@/lib/prisma"

/**
 * Cliente para el backend FastAPI de Meritcoin (ISCOUTB/Meritcoin).
 *
 * Lectura (espejo):
 * - GET /students/{wallet}/summary  (saldo MRT + badges manuales, el que usa su dashboard)
 * - GET /students/{wallet}/badges   (insignias del flujo automático audit_log+events)
 * - GET /students/{wallet}/balance  (saldo MRT on-chain)
 * - GET /badges/student/{student_id} (awards manuales por student_id)
 *
 * Escritura (emisión on-chain ERC-1155):
 * - GET /badges/templates?only_active=true + POST /badges/templates
 * - POST /badges/award  { template_id, student_id, student_wallet, issued_by_id, issued_by_role }
 */

export type MeritcoinBadge = {
  tokenId: string
  name: string
  description: string
  image: string | null
  metadataUri: string | null
  amount: number
}

export type MeritcoinTemplate = {
  id: string
  name: string
  description: string
  image_url: string | null
  criteria: string[]
}

export type MeritcoinAwardResult = {
  awardId: string
  txHash: string | null
  chainStatus: string
}

const MERITCOIN_API_URL = (process.env.MERITCOIN_API_URL || "http://localhost:8000").replace(/\/$/, "")
const IPFS_GATEWAY = (process.env.MERITCOIN_IPFS_GATEWAY || "https://ipfs.io/ipfs/").replace(/\/?$/, "/")
const MERITCOIN_ISSUER_ID = process.env.MERITCOIN_ISSUER_ID || "utb-app"
const MERITCOIN_ISSUER_ROLE = process.env.MERITCOIN_ISSUER_ROLE === "teacher" ? "teacher" : "admin"
const MERITCOIN_ONBOARDING_COURSE_ID = process.env.MERITCOIN_ONBOARDING_COURSE_ID || "GAMIFICACION-ONBOARDING"

export function isMeritcoinConfigured(): boolean {
  return !!process.env.MERITCOIN_API_URL
}

export function isValidWalletAddress(wallet: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(wallet.trim())
}

/**
 * Llave canónica adaptada a Meritcoin.
 * Meritcoin usa `STU-{userid}` de Moodle (ver plugin/classes/observer.php:206
 * y wallet_registry.student_id @unique). Acepta "3" → "STU-3" y "stu-3" → "STU-3".
 * Los IDs numéricos largos (códigos legacy ya emitidos como student_id, ej. "2026000001")
 * se conservan tal cual para no romper awards existentes.
 * Retorna null si el valor no puede normalizarse.
 */
export function normalizeMeritcoinStudentId(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (/^STU-\d+$/i.test(trimmed)) return `STU-${trimmed.slice(4)}`
  // Solo los numéricos cortos son userids de Moodle; los largos son IDs legacy ya usados en Meritcoin.
  if (/^\d{1,7}$/.test(trimmed)) return `STU-${trimmed}`
  return trimmed.length <= 100 ? trimmed : null
}

export type MeritcoinWalletLookup = {
  studentId: string
  walletAddress: string
  status: string
}

/** GET /wallets/{student_id} — espejo de wallet_registry sin exponer la clave privada. */
export async function getWalletByStudentId(meritcoinStudentId: string): Promise<MeritcoinWalletLookup | null> {
  const studentId = normalizeMeritcoinStudentId(meritcoinStudentId)
  if (!studentId || !isMeritcoinConfigured()) return null
  const payload = asRecord(await fetchJson(`/wallets/${encodeURIComponent(studentId)}`, 8000))
  const walletAddress = pickString(payload?.wallet_address)
  if (!walletAddress || !isValidWalletAddress(walletAddress)) return null
  return {
    studentId,
    walletAddress: walletAddress.trim(),
    status: pickString(payload?.status) ?? "active",
  }
}

/**
 * POST /wallets/provision — provisiona la wallet custodial en Meritcoin.
 * Requiere course_id + expires_at (ver backend/app/api/wallets.py ProvisionRequest).
 * Por defecto usa el curso de onboarding de gamificación con expiración a 1 año.
 */
export async function provisionCustodialWallet(
  meritcoinStudentId: string,
  courseId: string = MERITCOIN_ONBOARDING_COURSE_ID,
  expiresAt?: Date
): Promise<{ walletAddress: string; created: boolean }> {
  const studentId = normalizeMeritcoinStudentId(meritcoinStudentId)
  if (!studentId) throw new Error("meritcoinStudentId inválido (se espera formato STU-{id})")
  const expires = expiresAt ?? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
  const result = await postJson<{ wallet_address: string; created: boolean }>("/wallets/provision", {
    student_id: studentId,
    course_id: courseId,
    expires_at: expires.toISOString(),
  })
  if (!isValidWalletAddress(result.wallet_address)) {
    throw new Error("Meritcoin devolvió una wallet inválida")
  }
  return { walletAddress: result.wallet_address.trim(), created: result.created }
}

/**
 * Resuelve y persiste la wallet custodial de Meritcoin para un usuario.
 * 1) Si el perfil ya tiene wallet válida, la retorna.
 * 2) Si no, consulta GET /wallets/{STU-x} y la guarda.
 * 3) Si no existe, la provisiona con el curso de onboarding y la guarda.
 * Retorna null si no hay meritcoinStudentId o el backend no está disponible.
 */
export async function resolveCustodialWallet(
  userId: string,
  meritcoinStudentId: string | null | undefined
): Promise<{ walletAddress: string; created: boolean } | null> {
  const studentId = normalizeMeritcoinStudentId(meritcoinStudentId)
  if (!studentId) return null
  const profile = await prisma.studentProfile.findUnique({ where: { userId } })
  if (profile?.walletAddress && isValidWalletAddress(profile.walletAddress)) {
    return { walletAddress: profile.walletAddress.trim(), created: false }
  }
  const existing = await getWalletByStudentId(studentId).catch(() => null)
  if (existing) {
    await prisma.studentProfile.update({
      where: { userId },
      data: { walletAddress: existing.walletAddress, meritcoinStudentId: studentId },
    }).catch(() => undefined)
    return { walletAddress: existing.walletAddress, created: false }
  }
  try {
    const provisioned = await provisionCustodialWallet(studentId)
    await prisma.studentProfile.update({
      where: { userId },
      data: { walletAddress: provisioned.walletAddress, meritcoinStudentId: studentId },
    }).catch(() => undefined)
    return provisioned
  } catch (error) {
    console.error("Error provisionando wallet custodial:", error)
    return null
  }
}

/** Convierte ipfs://CID/... a URL HTTP vía gateway. */
export function resolveImageUrl(image: string | null): string | null {
  if (!image) return null
  const trimmed = image.trim()
  if (!trimmed) return null
  if (trimmed.startsWith("ipfs://")) {
    return `${IPFS_GATEWAY}${trimmed.slice("ipfs://".length)}`
  }
  return trimmed
}

async function fetchJson(path: string, timeoutMs = 6000): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${MERITCOIN_API_URL}${path}`, {
      signal: controller.signal,
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as unknown
  } catch {
    // Backend caído, timeout o red inalcanzable: se maneja como "no disponible"
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function postJson<T>(path: string, body: Record<string, unknown>, timeoutMs = 20000): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${MERITCOIN_API_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Meritcoin ${path} respondió ${response.status}: ${text.slice(0, 300)}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null
}

function pickString(...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim()
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate)
  }
  return null
}

function pickNumber(...candidates: unknown[]): number | null {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
    if (typeof candidate === "string" && candidate.trim() !== "" && Number.isFinite(Number(candidate))) {
      return Number(candidate)
    }
  }
  return null
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "badge"
}

/**
 * Normalización tolerante de los 3 formatos reales de Meritcoin:
 * - /students/{wallet}/summary → { mrt_balance, badges: [{name, image_url, awarded_at}] }
 * - /students/{wallet}/badges  → [{badge_id, course_id, course_name, event_type, uri, tx_hash, issued_at}]
 * - /badges/student/{id}       → [{id, template:{id,name,description,image_url}, tx_hash, ...}]
 * Más el formato genérico anterior como fallback.
 */
export function normalizeMeritcoinBadges(payload: unknown): MeritcoinBadge[] {
  const root = asRecord(payload)
  const rawList: unknown[] = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.badges) ? (root.badges as unknown[])
    : Array.isArray(root?.items) ? (root.items as unknown[])
    : Array.isArray(root?.data) ? (root.data as unknown[])
    : []

  const badges: MeritcoinBadge[] = []
  const seen = new Set<string>()

  for (const raw of rawList) {
    const item = asRecord(raw)
    if (!item) continue

    // Formato manual: { id, template: {...}, tx_hash, ... }
    const template = asRecord(item.template)
    if (template) {
      const templateId = pickString(template.id) ?? pickString(item.template_id)
      const tokenId = templateId ? `tpl-${templateId}` : null
      if (!tokenId || seen.has(tokenId)) continue
      const rawImage = pickString(template.image_url, template.image)
      seen.add(tokenId)
      badges.push({
        tokenId,
        name: pickString(template.name) ?? "Insignia Meritcoin",
        description: pickString(template.description) ?? "Insignia verificada on-chain (Meritcoin)",
        image: resolveImageUrl(rawImage),
        metadataUri: pickString(item.uri, item.metadata_uri),
        amount: 1,
      })
      continue
    }

    // Formato automático: { badge_id, course_name, event_type, uri, tx_hash, ... }
    const badgeId = pickString(item.badge_id, item.badgeId)
    if (badgeId) {
      const tokenId = `auto-${badgeId}`
      if (seen.has(tokenId)) continue
      seen.add(tokenId)
      const courseName = pickString(item.course_name, item.courseName, item.activity_name)
      const eventType = pickString(item.event_type, item.eventType)
      const uri = pickString(item.uri, item.metadata_uri)
      badges.push({
        tokenId,
        name: courseName ?? `Insignia #${badgeId}`,
        description: eventType ? `Insignia on-chain por ${eventType} (Meritcoin)` : "Insignia verificada on-chain (Meritcoin)",
        image: resolveImageUrl(uri),
        metadataUri: uri,
        amount: 1,
      })
      continue
    }

    // Formato summary: { name, image_url, awarded_at } (sin id)
    const summaryName = pickString(item.name)
    if (summaryName && (item.awarded_at !== undefined || item.image_url !== undefined)) {
      const tokenId = `summary-${slugify(summaryName)}`
      if (seen.has(tokenId)) continue
      seen.add(tokenId)
      badges.push({
        tokenId,
        name: summaryName,
        description: pickString(item.description) ?? "Insignia verificada on-chain (Meritcoin)",
        image: resolveImageUrl(pickString(item.image_url, item.image)),
        metadataUri: null,
        amount: 1,
      })
      continue
    }

    // Fallback genérico
    const meta = asRecord(item.metadata) ?? asRecord(item.attributes) ?? {}
    const tokenId =
      pickString(item.token_id, item.tokenId, item.tokenID, meta.token_id, meta.tokenId) ??
      pickString(item.id, meta.id)
    if (!tokenId || seen.has(tokenId)) continue

    const amount = pickNumber(item.amount, item.balance, item.quantity, meta.amount) ?? 1
    if (amount <= 0) continue

    const rawImage = pickString(item.image, item.image_url, item.imageUrl, meta.image, meta.image_url)
    const metadataUri = pickString(item.metadata_uri, item.metadataUri, item.metadata_url, item.uri, meta.metadata_uri)

    seen.add(tokenId)
    badges.push({
      tokenId,
      name: pickString(item.name, meta.name) ?? `Insignia #${tokenId}`,
      description: pickString(item.description, meta.description) ?? "Insignia verificada on-chain (Meritcoin)",
      image: resolveImageUrl(rawImage),
      metadataUri,
      amount,
    })
  }

  return badges
}

export async function getMeritcoinBadges(wallet: string): Promise<MeritcoinBadge[] | null> {
  const address = wallet.trim()
  if (!isValidWalletAddress(address)) return null

  // /summary es el endpoint que usa su dashboard (saldo + badges manuales);
  // /badges cubre el flujo automático (audit_log). Se combinan ambos.
  const [summary, autoBadges] = await Promise.all([
    fetchJson(`/students/${address}/summary`),
    fetchJson(`/students/${address}/badges`),
  ])
  if (summary === null && autoBadges === null) return null

  const combined = [...normalizeMeritcoinBadges(summary), ...normalizeMeritcoinBadges(autoBadges)]
  const seen = new Set<string>()
  return combined.filter((b) => (seen.has(b.tokenId) ? false : (seen.add(b.tokenId), true)))
}

export async function getMeritcoinBalance(wallet: string): Promise<number | null> {
  const address = wallet.trim()
  if (!isValidWalletAddress(address)) return null
  const summary = asRecord(await fetchJson(`/students/${address}/summary`))
  const fromSummary = pickNumber(summary?.mrt_balance, summary?.mrtBalance)
  if (fromSummary !== null) return fromSummary
  const balance = asRecord(await fetchJson(`/students/${address}/balance`))
  const direct = pickNumber(balance?.balance_mrt, balance?.balanceMrt)
  return direct
}

function normName(value: string): string {
  return value.trim().toLowerCase()
}

/**
 * Migración única: los espejos MERIT-summary-* creados por syncs anteriores
 * se fusionan en el espejo de plantilla homónimo (MERIT-tpl-*), moviendo
 * los otorgamientos y eliminando la tarjeta duplicada.
 */
async function migrateSummaryMirrors(): Promise<void> {
  const summaryMirrors = await prisma.badge.findMany({
    where: { externalId: { startsWith: "MERIT-summary-" } },
    include: { students: true },
  })
  if (summaryMirrors.length === 0) return

  const templateMirrors = await prisma.badge.findMany({
    where: { externalId: { startsWith: "MERIT-tpl-" } },
  })
  const byName = new Map(templateMirrors.map((b) => [normName(b.name), b]))

  for (const summary of summaryMirrors) {
    const target = byName.get(normName(summary.name))
    if (!target) continue
    for (const sb of summary.students) {
      const existing = await prisma.studentBadge.findUnique({
        where: { studentId_badgeId: { studentId: sb.studentId, badgeId: target.id } },
      })
      if (existing) {
        await prisma.studentBadge.delete({ where: { id: sb.id } })
      } else {
        await prisma.studentBadge.update({
          where: { id: sb.id },
          data: { badgeId: target.id, verifiedBy: "MERITCOIN" },
        })
      }
    }
    const remaining = await prisma.studentBadge.count({ where: { badgeId: summary.id } })
    if (remaining === 0) {
      await prisma.badge.delete({ where: { id: summary.id } }).catch(() => undefined)
    }
  }
}

/**
 * Decide si un espejo local puede ser borrado por la reconciliación de
 * syncMeritcoinBadges (la que consulta /summary y /students/{wallet}/badges).
 *
 * Los espejos MERIT-tpl-* son propiedad del sync por student_id (catálogo de
 * plantillas + awards). /summary une los awards por student_wallet, así que un
 * award válido cuya wallet no sea la del perfil NO aparece ahí: borrarlo desde
 * este path perdería insignias legítimas que el otro path acaba de reflejar.
 * Solo se reconcilian los espejos que este mismo path crea (MERIT-<tokenId> y
 * MERIT-summary-*, legados de syncs anteriores).
 */
export function isReconcilableMirror(externalId: string | null | undefined): boolean {
  if (!externalId?.startsWith("MERIT-")) return false
  return !externalId.startsWith("MERIT-tpl-")
}

/**
 * Prefijo de los espejos de plantilla. Distingue dos propietarios:
 * - MERIT-tpl-*  → el sync por student_id (catálogo + awards)
 * - MERIT-*      → el sync por wallet (/summary y flujo automático)
 */
const TEMPLATE_MIRROR_PREFIX = "MERIT-tpl-"

function templateMirrorExternalId(templateId: string): string {
  return `${TEMPLATE_MIRROR_PREFIX}${templateId}`
}

/** Invierte templateMirrorExternalId. null si el espejo no es de plantilla. */
export function templateIdFromMirror(externalId: string | null | undefined): string | null {
  if (!externalId?.startsWith(TEMPLATE_MIRROR_PREFIX)) return null
  return externalId.slice(TEMPLATE_MIRROR_PREFIX.length) || null
}

/**
 * Un award revocado O eliminado en Meritcoin tiene que perder la marca local,
 * y este sync es el único dueño de las marcas sobre espejos MERIT-tpl-*.
 * No aplica a los espejos del sync por wallet: esos los reconcilia él mismo.
 */
export function shouldDemarkTemplateMirror(
  externalId: string | null | undefined,
  activeTemplateIds: ReadonlySet<string>
): boolean {
  const templateId = templateIdFromMirror(externalId)
  return templateId !== null && !activeTemplateIds.has(templateId)
}

/**
 * Refleja las insignias on-chain como insignias espejo locales.
 * - Los awards manuales (vía /summary) pertenecen a una plantilla: se marcan
 *   sobre el espejo de plantilla homónimo, sin crear tarjeta duplicada.
 * - Los del flujo automático (por curso) conservan su propio espejo.
 * - Si Meritcoin deja de listar una insignia (revocada), se desmarca localmente.
 * Devuelve { synced, connected } para distinguir "sin badges" de "backend caído".
 */
export async function syncMeritcoinBadges(
  userId: string,
  wallet: string
): Promise<{ synced: number; connected: boolean }> {
  const badges = await getMeritcoinBadges(wallet)
  if (badges === null) return { synced: 0, connected: false }

  await migrateSummaryMirrors().catch((error) => {
    console.error("Error migrando espejos summary de Meritcoin:", error)
  })

  const templateMirrors = await prisma.badge.findMany({
    where: { externalId: { startsWith: "MERIT-tpl-" } },
  })
  const mirrorByName = new Map(templateMirrors.map((b) => [normName(b.name), b]))

  let synced = 0
  const earnedNames = new Set<string>()
  for (const badge of badges) {
    earnedNames.add(normName(badge.name))

    const templateMirror =
      badge.tokenId.startsWith("summary-") ? mirrorByName.get(normName(badge.name)) : undefined
    if (templateMirror) {
      await prisma.studentBadge.upsert({
        where: { studentId_badgeId: { studentId: userId, badgeId: templateMirror.id } },
        update: { verifiedBy: "MERITCOIN" },
        create: {
          studentId: userId,
          badgeId: templateMirror.id,
          evidence: "Otorgada en Meritcoin (verificada on-chain)",
          verifiedBy: "MERITCOIN",
        },
      })
      synced++
      continue
    }

    const externalId = `MERIT-${badge.tokenId}`

    let local = await prisma.badge.findUnique({ where: { externalId } })
    if (!local) {
      local = await prisma.badge.create({
        data: {
          name: badge.name,
          description: badge.description,
          iconUrl: badge.image ?? "🏅",
          category: "MERITCOIN",
          externalId,
        },
      })
    }

    await prisma.studentBadge.upsert({
      where: { studentId_badgeId: { studentId: userId, badgeId: local.id } },
      update: {
        evidence: badge.metadataUri ?? undefined,
        verifiedBy: "MERITCOIN",
      },
      create: {
        studentId: userId,
        badgeId: local.id,
        evidence: badge.metadataUri,
        verifiedBy: "MERITCOIN",
      },
    })
    synced++
  }

  // Reconciliar revocados: si Meritcoin ya no lista la insignia, desmarcarla.
  const meritRows = await prisma.studentBadge.findMany({
    where: { studentId: userId, verifiedBy: "MERITCOIN" },
    include: { badge: true },
  })
  for (const row of meritRows) {
    if (!isReconcilableMirror(row.badge.externalId)) continue
    if (!earnedNames.has(normName(row.badge.name))) {
      await prisma.studentBadge.delete({ where: { id: row.id } }).catch(() => undefined)
    }
  }

  return { synced, connected: true }
}

/**
 * Refleja las PLANTILLAS de Meritcoin como insignias locales (catálogo).
 * Así la página de Logros muestra las insignias reales de Meritcoin
 * (Mérito, Honor, Excelencia, Participación, Especial) con la misma
 * estética, marcadas como bloqueadas hasta que el estudiante las gane.
 * Idempotente: externalId = "MERIT-tpl-<templateId>" (misma convención
 * que usa syncMeritcoinBadges al reflejar awards).
 */
const MERITCOIN_TYPE_ICONS: Record<string, string> = {
  "mérito": "⭐",
  "merito": "⭐",
  "honor": "👑",
  "excelencia": "🏆",
  "participación": "👥",
  "participacion": "👥",
  "especial": "💎",
}

export async function syncMeritcoinTemplates(): Promise<{ synced: number; connected: boolean }> {
  if (!isMeritcoinConfigured()) return { synced: 0, connected: false }
  const templates = await listMeritcoinTemplates().catch(() => null)
  if (!templates) return { synced: 0, connected: false }

  let synced = 0
  for (const template of templates) {
    const externalId = `MERIT-tpl-${template.id}`
    const description = template.criteria.length > 0
      ? `${template.description}\n\nCriterio: ${template.criteria.join("; ")}`
      : template.description
    const iconUrl =
      template.image_url && template.image_url.startsWith("http")
        ? template.image_url
        : (MERITCOIN_TYPE_ICONS[template.name.trim().toLowerCase()] ?? "🏅")

    await prisma.badge.upsert({
      where: { externalId },
      update: { name: template.name, description, iconUrl, category: "MERITCOIN", isActive: true },
      create: {
        name: template.name,
        description,
        iconUrl,
        category: "MERITCOIN",
        externalId,
      },
    })
    synced++
  }

  return { synced, connected: true }
}

// ── Emisión on-chain ─────────────────────────────────────────────

type MeritcoinTemplatePayload = {
  id: string
  name: string
  description: string
  image_url: string | null
  criteria: string[]
}

type MeritcoinAwardPayload = {
  id: string
  template: MeritcoinTemplatePayload
  student_id: string
  student_wallet: string | null
  tx_hash: string | null
  chain_status: string
}

export async function listMeritcoinTemplates(): Promise<MeritcoinTemplate[] | null> {
  const payload = await fetchJson("/badges/templates?only_active=true", 8000)
  if (!Array.isArray(payload)) return null
  return (payload as unknown[])
    .map((raw) => {
      const item = asRecord(raw)
      if (!item) return null
      const id = pickString(item.id)
      const name = pickString(item.name)
      if (!id || !name) return null
      const criteria = Array.isArray(item.criteria)
        ? (item.criteria as unknown[]).filter((c): c is string => typeof c === "string" && c.trim() !== "")
        : []
      return {
        id,
        name,
        description: pickString(item.description) ?? "",
        image_url: pickString(item.image_url, item.imageUrl),
        criteria,
      } satisfies MeritcoinTemplate
    })
    .filter((t): t is MeritcoinTemplate => t !== null)
}

export async function findOrCreateMeritcoinTemplate(input: {
  name: string
  description: string
  imageUrl?: string | null
}): Promise<MeritcoinTemplate> {
  const templates = await listMeritcoinTemplates()
  if (!templates) throw new Error("No se pudo contactar el backend de Meritcoin")
  const existing = templates.find((t) => t.name.trim().toLowerCase() === input.name.trim().toLowerCase())
  if (existing) return existing

  const created = await postJson<MeritcoinTemplatePayload>("/badges/templates", {
    name: input.name,
    description: input.description,
    image_url: input.imageUrl && input.imageUrl.startsWith("http") ? input.imageUrl : null,
    criteria: [input.description],
    created_by_id: MERITCOIN_ISSUER_ID,
    created_by_role: MERITCOIN_ISSUER_ROLE,
  })
  return {
    id: created.id,
    name: created.name,
    description: created.description,
    image_url: created.image_url,
    criteria: Array.isArray(created.criteria) ? created.criteria : [input.description],
  }
}

export async function awardMeritcoinBadge(input: {
  templateId: string
  studentId: string
  wallet: string
}): Promise<MeritcoinAwardResult> {
  const award = await postJson<MeritcoinAwardPayload>("/badges/award", {
    template_id: input.templateId,
    student_id: input.studentId,
    student_wallet: input.wallet,
    issued_by_id: MERITCOIN_ISSUER_ID,
    issued_by_role: MERITCOIN_ISSUER_ROLE,
  })
  return { awardId: award.id, txHash: award.tx_hash, chainStatus: award.chain_status }
}

export async function getMeritcoinAwardsByStudentId(studentId: string): Promise<MeritcoinAwardPayload[] | null> {
  const payload = await fetchJson(`/badges/student/${encodeURIComponent(studentId)}`, 8000)
  // null = backend inalcanzable (distinto de "cero awards", que es [])
  if (!Array.isArray(payload)) return null
  return (payload as unknown[])
    .map((raw) => asRecord(raw))
    .filter((r): r is Record<string, unknown> => !!r && typeof r.id === "string" && !!asRecord(r.template))
    .map((r) => r as unknown as MeritcoinAwardPayload)
}

/**
 * Sincroniza los awards de Meritcoin por student_id (ID de Moodle/Meritcoin),
 * sin necesidad de wallet registrada. Para cada award no revocado:
 * - asegura el espejo de plantilla (MERIT-tpl-<templateId>)
 * - marca la insignia como ganada (MERITCOIN)
 * - si el perfil no tiene wallet y el award trae una válida, la importa
 *   automáticamente (así el resto del flujo on-chain sigue funcionando).
 */
export async function syncMeritcoinAwardsByStudentId(
  userId: string,
  meritcoinStudentId: string
): Promise<{ synced: number; connected: boolean; walletImported: boolean }> {
  // Normaliza a la llave canónica STU-{id} antes de consultar a Meritcoin.
  // Además consulta la variante numérica cruda: el flujo manual de Moodle
  // (plugin/badge_award.php) guarda student_id sin prefijo STU-.
  const studentId = normalizeMeritcoinStudentId(meritcoinStudentId) ?? meritcoinStudentId.trim()
  const variants = [studentId]
  const rawMatch = /^STU-(\d+)$/i.exec(studentId)
  if (rawMatch) variants.push(rawMatch[1])
  const fetched = await Promise.all(variants.map((v) => getMeritcoinAwardsByStudentId(v).catch(() => null)))
  if (fetched.every((f) => f === null)) return { synced: 0, connected: false, walletImported: false }
  const seen = new Set<string>()
  const awards = (fetched.flat().filter(Boolean) as MeritcoinAwardPayload[]).filter((a) =>
    seen.has(a.id) ? false : (seen.add(a.id), true)
  )

  let synced = 0
  let walletImported = false
  const profile = await prisma.studentProfile.findUnique({ where: { userId } })
  const activeTemplateIds = new Set<string>()

  for (const award of awards) {
    const template = award.template
    if (!template?.id || !template?.name) continue

    // Un award revocado no se refleja; la limpieza la hace reconcileTemplateMirrors.
    if (asRecord(award as unknown)?.revoked) continue
    activeTemplateIds.add(template.id)

    const externalId = templateMirrorExternalId(template.id)
    const description = [
      template.description,
      Array.isArray(template.criteria) && template.criteria.length > 0
        ? `Criterio: ${template.criteria.join("; ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n\n")
    const iconUrl =
      template.image_url && template.image_url.startsWith("http")
        ? template.image_url
        : (MERITCOIN_TYPE_ICONS[template.name.trim().toLowerCase()] ?? "🏅")

    const mirror = await prisma.badge.upsert({
      where: { externalId },
      update: { name: template.name, description, iconUrl, category: "MERITCOIN", isActive: true },
      create: { name: template.name, description, iconUrl, category: "MERITCOIN", externalId },
    })

    await prisma.studentBadge.upsert({
      where: { studentId_badgeId: { studentId: userId, badgeId: mirror.id } },
      update: { verifiedBy: "MERITCOIN" },
      create: {
        studentId: userId,
        badgeId: mirror.id,
        evidence: `Otorgada en Meritcoin: award ${award.id}${award.tx_hash ? ` tx ${award.tx_hash}` : ""}`,
        verifiedBy: "MERITCOIN",
      },
    })
    synced++

    if (profile && !profile.walletAddress && award.student_wallet && isValidWalletAddress(award.student_wallet)) {
      await prisma.studentProfile.update({
        where: { userId },
        data: { walletAddress: award.student_wallet.trim() },
      })
      profile.walletAddress = award.student_wallet.trim()
      walletImported = true
    }
  }

  await reconcileTemplateMirrors(userId, activeTemplateIds)

  return { synced, connected: true, walletImported }
}

/**
 * Desmarca los espejos MERIT-tpl-* que Meritcoin ya no reporta como awards
 * vigentes (revocados o eliminados). La tarjeta del catálogo se conserva; solo
 * se borra la marca de "ganada", y solo si verifiedBy = MERITCOIN, para no pisar
 * una insignia ganada en gamificación que comparta el mismo espejo.
 *
 * Se apoya en que acá se llegó con una respuesta real del backend: si el backend
 * estuvo caído, getMeritcoinAwardsByStudentId devuelve null y la función retorna
 * antes, con connected: false, sin tocar nada.
 */
async function reconcileTemplateMirrors(userId: string, activeTemplateIds: ReadonlySet<string>): Promise<void> {
  const marked = await prisma.studentBadge.findMany({
    where: { studentId: userId, verifiedBy: "MERITCOIN" },
    include: { badge: { select: { externalId: true } } },
  })

  for (const row of marked) {
    if (!shouldDemarkTemplateMirror(row.badge.externalId, activeTemplateIds)) continue
    await prisma.studentBadge.delete({ where: { id: row.id } }).catch(() => undefined)
  }
}

export type EmitResult =
  | { awarded: true; awardId: string; txHash: string | null; chainStatus: string }
  | { awarded: false; reason: "not-configured" | "no-wallet" | "no-merit-id" | "invalid-wallet" | "already-awarded" | "error"; detail?: string }

/**
 * Emite una insignia local a Meritcoin (ERC-1155) de forma idempotente.
 * Adaptado a Meritcoin: usa meritcoinStudentId (formato STU-{userid} de Moodle,
 * ver wallet_registry.student_id) como student_id, nunca el studentCode.
 * - Reutiliza la plantilla Meritcoin por nombre (la crea si no existe).
 * - Si ya existe un award no revocado para esa plantilla, no duplica.
 * - Marca el StudentBadge local como MERITCOIN con el award/tx en evidencia.
 */
export async function emitLocalBadgeToMeritcoin(userId: string, badgeId: string): Promise<EmitResult> {
  if (!isMeritcoinConfigured()) return { awarded: false, reason: "not-configured" }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { studentProfile: true },
  })
  const badge = await prisma.badge.findUnique({ where: { id: badgeId } })
  if (!user || !badge) return { awarded: false, reason: "error", detail: "Usuario o insignia no encontrados" }

  const wallet = user.studentProfile?.walletAddress?.trim()
  if (!wallet) return { awarded: false, reason: "no-wallet" }
  if (!isValidWalletAddress(wallet)) return { awarded: false, reason: "invalid-wallet" }

  // Las insignias espejo (MERIT-*) ya viven on-chain: no re-emitir.
  if (badge.externalId?.startsWith("MERIT-")) return { awarded: false, reason: "already-awarded" }

  // Llave canónica Meritcoin: STU-{userid}. Sin ella no se puede emitir ni conciliar.
  const studentId = normalizeMeritcoinStudentId(user.studentProfile?.meritcoinStudentId)
  if (!studentId) {
    return { awarded: false, reason: "no-merit-id", detail: "Vincula tu ID de Meritcoin/Moodle (formato STU-3) en tu perfil" }
  }

  try {
    const [template, existingAwards] = await Promise.all([
      findOrCreateMeritcoinTemplate({
        name: badge.name,
        description: badge.description,
        imageUrl: badge.iconUrl.startsWith("http") ? badge.iconUrl : null,
      }),
      getMeritcoinAwardsByStudentId(studentId).then((a) => a ?? []).catch(() => [] as MeritcoinAwardPayload[]),
    ])

    const already = existingAwards.find((a) => !asRecord(a as unknown)?.revoked && a.template?.id === template.id)
    if (already) {
      await markLocalBadgeOnChain(userId, badgeId, already.id, already.tx_hash)
      return { awarded: false, reason: "already-awarded", detail: already.id }
    }

    const award = await awardMeritcoinBadge({ templateId: template.id, studentId, wallet })
    await markLocalBadgeOnChain(userId, badgeId, award.awardId, award.txHash)
    return { awarded: true, awardId: award.awardId, txHash: award.txHash, chainStatus: award.chainStatus }
  } catch (error) {
    console.error("Error emitiendo insignia a Meritcoin:", error)
    return { awarded: false, reason: "error", detail: error instanceof Error ? error.message : "Error desconocido" }
  }
}

async function markLocalBadgeOnChain(
  userId: string,
  badgeId: string,
  awardId: string,
  txHash: string | null
): Promise<void> {
  const current = await prisma.studentBadge.findUnique({
    where: { studentId_badgeId: { studentId: userId, badgeId } },
  })
  const suffix = `Meritcoin on-chain: award ${awardId}${txHash ? ` tx ${txHash}` : ""}`
  const evidence = current?.evidence ? `${current.evidence} | ${suffix}` : suffix
  if (!current) {
    await prisma.studentBadge.create({
      data: { studentId: userId, badgeId, evidence, verifiedBy: "MERITCOIN" },
    })
    return
  }
  if (current.verifiedBy === "MERITCOIN" && current.evidence?.includes(awardId)) return
  await prisma.studentBadge.update({
    where: { studentId_badgeId: { studentId: userId, badgeId } },
    data: { evidence, verifiedBy: "MERITCOIN" },
  })
}
