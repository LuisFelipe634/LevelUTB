import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { parsePeriod } from "@/lib/period"
import { requireRole, jsonForbidden, jsonUnauthorized } from "@/lib/session"

export async function GET() {
  const session = await requireRole("ADMIN")
  if (session.error) {
    if (session.status === 401) return jsonUnauthorized(session.error)
    return jsonForbidden(session.error)
  }

  const periods = await prisma.academicPeriod.findMany({ orderBy: { startsAt: "desc" } })
  return NextResponse.json({ periods })
}

export async function POST(request: Request) {
  const session = await requireRole("ADMIN")
  if (session.error) {
    if (session.status === 401) return jsonUnauthorized(session.error)
    return jsonForbidden(session.error)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 })
  }

  const input = body as { code?: unknown; startsAt?: unknown; endsAt?: unknown; status?: unknown }
  if (typeof input.code !== "string" || !parsePeriod(input.code)) {
    return NextResponse.json({ error: "El código debe tener el formato YYYY-1 o YYYY-2" }, { status: 400 })
  }
  if (typeof input.startsAt !== "string" || typeof input.endsAt !== "string") {
    return NextResponse.json({ error: "Debes indicar startsAt y endsAt" }, { status: 400 })
  }

  const startsAt = new Date(input.startsAt)
  const endsAt = new Date(input.endsAt)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || startsAt >= endsAt) {
    return NextResponse.json({ error: "Las fechas del periodo no son válidas" }, { status: 400 })
  }

  const allowedStatuses = ["FUTURE", "ACTIVE", "EN_CIERRE", "CLOSED"] as const
  const status = typeof input.status === "string" && allowedStatuses.includes(input.status as typeof allowedStatuses[number])
    ? input.status as typeof allowedStatuses[number]
    : "FUTURE"

  try {
    const period = await prisma.academicPeriod.create({
      data: { code: input.code, startsAt, endsAt, status },
    })
    return NextResponse.json({ period }, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "El periodo ya existe" }, { status: 409 })
    }
    throw error
  }
}
