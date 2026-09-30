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
    const body = await request.json()
    const { studentRewardId, courseId, decision, comment } = body as { studentRewardId: string; courseId?: string; decision: "approve" | "reject"; comment?: string }

    if (!studentRewardId || !["approve", "reject"].includes(decision)) {
      return NextResponse.json({ error: "Decisión inválida" }, { status: 400 })
    }

    const reviewRewardUseCase = getReviewRewardUseCase()
    const result = await reviewRewardUseCase.execute(teacherUserId, { studentRewardId, courseId, decision, comment })

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