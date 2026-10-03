import { NextResponse } from "next/server"
import { closeAcademicPeriod, SemesterClosingError } from "@/application/academic/semesterClosingService"
import { requireRole, jsonForbidden, jsonUnauthorized } from "@/lib/session"

export async function POST(
  _request: Request,
  context: { params: Promise<{ code: string }> },
) {
  const session = await requireRole("ADMIN")
  if (session.error) {
    if (session.status === 401) return jsonUnauthorized(session.error)
    return jsonForbidden(session.error)
  }

  const { code } = await context.params

  try {
    const result = await closeAcademicPeriod(code)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof SemesterClosingError) {
      const status = error.code === "PERIOD_NOT_FOUND" || error.code === "NEXT_PERIOD_NOT_FOUND" ? 404 : 409
      return NextResponse.json({ error: error.code }, { status })
    }

    console.error("Error closing academic period:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
