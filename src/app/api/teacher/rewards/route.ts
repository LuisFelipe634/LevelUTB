import { NextResponse } from "next/server"
import { requireRole, jsonUnauthorized, jsonForbidden } from "@/lib/session"
import { getGetTeacherRewardsUseCase, getReviewRewardUseCase } from "@/application/rewards/rewardFactory"

export async function GET() {
  const session = await requireRole("TEACHER")

  if (session.error) {
    return session.status === 401 ? jsonUnauthorized(session.error) : jsonForbidden(session.error)
  }

  const teacherUserId = session.data?.userId
  if (!teacherUserId) {
    return jsonUnauthorized("No autorizado")
  }

  try {
    const getTeacherRewardsUseCase = getGetTeacherRewardsUseCase()
    const result = await getTeacherRewardsUseCase.execute(teacherUserId)

    return NextResponse.json({
      pending: result.pending,
      reviewed: result.reviewed,
    })
  } catch (error) {
    console.error("Error fetching teacher rewards:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await requireRole("TEACHER")

  if (session.error) {
    return session.status === 401 ? jsonUnauthorized(session.error) : jsonForbidden(session.error)
  }

  const teacherUserId = session.data?.userId
  if (!teacherUserId) {
    return jsonUnauthorized("No autorizado")
  }

  try {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: "Cuerpo JSON inválido" }, { status: 400 })
    }
    const { studentRewardId, courseId, decision, comment } = body as { studentRewardId?: unknown; courseId?: string; decision?: unknown; comment?: unknown }

    if (typeof studentRewardId !== "string" || !["approve", "reject"].includes(decision as string)) {
      return NextResponse.json({ error: "Decisión inválida" }, { status: 400 })
    }
    if (typeof comment === "string" && comment.length > 2000) {
      return NextResponse.json({ error: "El comentario no puede superar 2000 caracteres" }, { status: 400 })
    }

    const reviewRewardUseCase = getReviewRewardUseCase()
    const result = await reviewRewardUseCase.execute(teacherUserId, { studentRewardId, courseId, decision: decision as "approve" | "reject", comment: typeof comment === "string" ? comment : undefined })

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error reviewing reward:", error)

    if (error instanceof Error) {
      switch (error.message) {
        case "INVALID_REQUEST":
          return NextResponse.json({ error: "Solicitud no encontrada o ya procesada" }, { status: 400 })
        case "STUDENT_PROFILE_NOT_FOUND":
          return NextResponse.json({ error: "Perfil de estudiante no encontrado" }, { status: 404 })
        case "NOT_ASSIGNED":
          return NextResponse.json({ error: "El estudiante no pertenece a tus cursos vigentes" }, { status: 403 })
        case "El estudiante no está matriculado en ese curso asignado":
          return NextResponse.json({ error: error.message }, { status: 403 })
      }
    }

    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}