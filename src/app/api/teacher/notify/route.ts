import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recordUserActivity, ACTIVITY_ACTIONS } from "@/lib/activity"
import { requireRole, jsonUnauthorized, jsonForbidden } from "@/lib/session"

export async function POST(request: Request) {
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
    const { studentId, customMessage } = body as { studentId?: unknown; customMessage?: unknown }

    if (!studentId || typeof studentId !== "string") {
      return NextResponse.json({ error: "studentId requerido" }, { status: 400 })
    }
    if (typeof customMessage === "string" && customMessage.length > 2000) {
      return NextResponse.json({ error: "El mensaje no puede superar 2000 caracteres" }, { status: 400 })
    }

    // Verificar que el docente tiene asignado al estudiante
    const teacher = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: { teacherProfile: { include: { assignedCourses: true } } },
    })
    const assignedCourseIds = teacher?.teacherProfile?.assignedCourses?.map((a) => a.courseId) ?? []
    const assignedPeriods = [...new Set(teacher?.teacherProfile?.assignedCourses?.map((a) => a.period) ?? [])]

    if (assignedCourseIds.length === 0) {
      return NextResponse.json({ error: "No tienes cursos asignados" }, { status: 403 })
    }

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentProfile: {
          include: {
            program: { include: { courses: { include: { semester: true, prerequisites: { include: { prerequisite: true } } } } } },
            enrollments: { include: { course: true } },
          },
        },
      },
    })

    if (!student?.studentProfile || student?.role !== "STUDENT") {
      return NextResponse.json({ error: "Estudiante no encontrado" }, { status: 404 })
    }

    const isAssigned = student.studentProfile.enrollments.some((e) => assignedCourseIds.includes(e.courseId) && ["CURSANDO","INSCRITO"].includes(e.status) && (assignedPeriods.length === 0 || assignedPeriods.includes(e.semesterCode)))
    if (!isAssigned) {
      return NextResponse.json({ error: "El estudiante no pertenece a tus cursos vigentes (matriculado)" }, { status: 403 })
    }

    // Calcular ruta recomendada igual que en GET /api/teacher
    const approvedCodes = new Set(
      student.studentProfile.enrollments.filter((e) => e.status === "APROBADO").map((e) => e.course.code)
    )
    const suggestedCourses = student.studentProfile.program.courses
      .filter((course) => !approvedCodes.has(course.code))
      .filter((course) => course.prerequisites.every(({ prerequisite }) => approvedCodes.has(prerequisite.code)))
      .sort((a, b) => a.semester.number - b.semester.number)
      .slice(0, 3)

    if (suggestedCourses.length === 0) {
      return NextResponse.json({ error: "No hay ruta recomendada disponible para este estudiante" }, { status: 400 })
    }

    const coursesText = suggestedCourses.map((c) => `${c.code} - ${c.name} (${c.credits} cr, Sem ${c.semester.number})`).join(", ")
    const messageBase = `Tu docente te recomienda priorizar: ${coursesText}. Revisa tu malla curricular para inscribir estas materias el próximo semestre.`
    const message = customMessage && typeof customMessage === "string" && customMessage.trim()
      ? `${messageBase} Mensaje del docente: ${customMessage.trim()}`
      : messageBase

    const notification = await prisma.notification.create({
      data: {
        userId: student.id,
        title: "Ruta recomendada urgente de tu docente",
        message,
        type: "ALERTA_RIESGO",
        link: "/malla",
      },
    })

    await recordUserActivity(student.id, ACTIVITY_ACTIONS.ROUTE_RECOMMENDED_DOCENTE, {
      teacherId: teacherUserId,
      studentId: student.id,
      suggestedCourses: suggestedCourses.map((c) => ({ code: c.code, name: c.name, credits: c.credits, semester: c.semester.number })),
      notificationId: notification.id,
    })

    return NextResponse.json({ success: true, notification })
  } catch (error) {
    console.error("Error enviando ruta recomendada:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
