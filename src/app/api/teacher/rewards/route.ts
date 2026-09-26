import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { recordUserActivity, ACTIVITY_ACTIONS } from "@/lib/activity"
import { requireRole, jsonUnauthorized, jsonForbidden } from "@/lib/session"

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
    const teacher = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: {
        teacherProfile: {
          include: { assignedCourses: { include: { course: { include: { semester: true } } } } }
        }
      }
    })

    const assignedCourses = teacher?.teacherProfile?.assignedCourses || []
    const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId)
    const assignedPeriods = [...new Set(assignedCourses.map((assignment) => assignment.period))]
    const courseById = new Map(assignedCourses.map((assignment) => [assignment.courseId, assignment]))

    if (assignedCourseIds.length === 0) {
      return NextResponse.json({ rewards: [] })
    }

    // Obtener estudiantes matriculados en los cursos del docente
    const studentProfiles = await prisma.studentProfile.findMany({
      where: {
        enrollments: {
          some: {
            courseId: { in: assignedCourseIds },
            status: { in: ["CURSANDO", "INSCRITO"] as const },
            ...(assignedPeriods.length ? { semesterCode: { in: assignedPeriods } } : {}),
          },
        },
      },
      select: { userId: true }
    })

    const studentIds = studentProfiles.map((p) => p.userId)

    // Obtener solicitudes de recompensa pendientes de esos estudiantes.
    // courseId limitado a las materias asignadas: un docente solo ve los canjes
    // de las materias que da. Si no, veria los canjes de sus estudiantes en
    // materias de otros docentes (son los mismos estudiantes).
    const pendingRewards = await prisma.studentReward.findMany({
      where: {
        studentId: { in: studentIds },
        courseId: { in: assignedCourseIds },
        status: "SOLICITADO"
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: {
              select: {
                studentCode: true,
                enrollments: {
                  where: {
                    courseId: { in: assignedCourseIds },
                    status: { in: ["CURSANDO", "INSCRITO"] as const },
                    ...(assignedPeriods.length ? { semesterCode: { in: assignedPeriods } } : {})
                  },
                  select: { courseId: true, semesterCode: true, course: { select: { id: true, code: true, name: true, semester: { select: { number: true } } } } }
                }
              }
            }
          }
        },
        course: { include: { semester: true } },
        reward: true
      },
      orderBy: { requestedAt: "asc" }
    })

    // Obtener tambiÃ©n las ya revisadas (historial), igualmente limitadas a las
    // materias asignadas para que el docente no vea revisiones de otros.
    const reviewedRewards = await prisma.studentReward.findMany({
      where: {
        studentId: { in: studentIds },
        courseId: { in: assignedCourseIds },
        status: { in: ["APROBADO", "RECHAZADO"] as const }
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: {
              select: { studentCode: true }
            }
          }
        },
        course: { include: { semester: true } },
        reward: true
      },
      orderBy: { reviewedAt: "desc" },
      take: 50
    })

    return NextResponse.json({
      pending: pendingRewards.map((sr) => ({
        id: sr.id,
        studentId: sr.student.id,
        studentName: sr.student.name,
        studentEmail: sr.student.email,
        studentCode: sr.student.studentProfile?.studentCode,
        courses: [{
          id: sr.course.id,
          code: sr.course.code,
          name: sr.course.name,
          semester: sr.course.semester.number,
          period: sr.student.studentProfile?.enrollments.find((enrollment) => enrollment.courseId === sr.courseId)?.semesterCode || "",
          assignmentId: courseById.get(sr.courseId)?.id || null
        }],
        reward: {
          id: sr.reward.id,
          name: sr.reward.name,
          description: sr.reward.description,
          icon: sr.reward.icon,
          category: sr.reward.category,
          cost: sr.reward.cost
        },
        pointsSpent: sr.pointsSpent,
        evidence: sr.evidence,
        requestedAt: sr.requestedAt,
        expiresAt: sr.expiresAt
      })),
      reviewed: reviewedRewards.map((sr) => ({
        id: sr.id,
        studentId: sr.student.id,
        studentName: sr.student.name,
        studentCode: sr.student.studentProfile?.studentCode,
        rewardName: sr.reward.name,
        status: sr.status,
        pointsSpent: sr.pointsSpent,
        reviewNote: sr.reviewNote,
        reviewedAt: sr.reviewedAt,
        reviewedBy: sr.reviewedBy,
        course: {
          id: sr.course.id,
          code: sr.course.code,
          name: sr.course.name,
          semester: sr.course.semester.number
        }
      }))
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
      return NextResponse.json({ error: "DecisiÃ³n invÃ¡lida" }, { status: 400 })
    }

    const studentReward = await prisma.studentReward.findUnique({
      where: { id: studentRewardId },
      include: {
        reward: true,
        student: {
          select: { id: true, name: true, email: true, studentProfile: { select: { studentCode: true } } }
        }
      }
    })

    if (!studentReward || studentReward.status !== "SOLICITADO") {
      return NextResponse.json({ error: "Solicitud no encontrada o ya procesada" }, { status: 400 })
    }

    // Verificar que el docente tiene asignado al estudiante
    const teacher = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: { teacherProfile: { include: { assignedCourses: true } } },
    })
    const assignedCourseIds = teacher?.teacherProfile?.assignedCourses.map((a) => a.courseId) || []
    const assignedPeriods = [...new Set(teacher?.teacherProfile?.assignedCourses.map((a) => a.period) || [])]

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: studentReward.studentId },
      include: { enrollments: { include: { course: true } } }
    })

    if (!studentProfile) {
      return NextResponse.json({ error: "Perfil de estudiante no encontrado" }, { status: 404 })
    }

    const eligibleEnrollments = studentProfile.enrollments.filter((enrollment) =>
      assignedCourseIds.includes(enrollment.courseId) &&
      ["CURSANDO", "INSCRITO"].includes(enrollment.status) &&
      (assignedPeriods.length === 0 || assignedPeriods.includes(enrollment.semesterCode))
    )

    if (courseId && !eligibleEnrollments.some((enrollment) => enrollment.courseId === courseId)) {
      return NextResponse.json({ error: "El estudiante no estÃ¡ matriculado en ese curso asignado" }, { status: 403 })
    }

    const isAssigned = eligibleEnrollments.length > 0

    if (!isAssigned) {
      return NextResponse.json({ error: "El estudiante no pertenece a tus cursos vigentes" }, { status: 403 })
    }

    const approved = decision === "approve"

    await prisma.$transaction(async (transaction) => {
      if (approved) {
        // Aprobar: actualizar solicitud
        await transaction.studentReward.update({
          where: { id: studentRewardId },
          data: {
            status: "APROBADO",
            reviewedAt: new Date(),
            reviewedBy: teacherUserId,
            reviewNote: typeof comment === "string" && comment.trim() ? comment.trim() : null
          }
        })

        // Notificar al estudiante
        await transaction.notification.create({
          data: {
            userId: studentReward.studentId,
            title: "Recompensa aprobada",
            message: `Tu solicitud para "${studentReward.reward.name}" fue aprobada por tu docente. Ya puedes usar la bonificaciÃ³n (vÃ¡lida por 30 dÃ­as).`,
            type: "SOLICITUD_RECOMPENSA",
            link: "/recompensas"
          }
        })
      } else {
        // Rechazar: devolver puntos y actualizar solicitud
        await transaction.point.create({
          data: {
            userId: studentReward.studentId,
            amount: studentReward.pointsSpent,
            source: "MISION_COMPLETADA",
            description: `Reembolso: ${studentReward.reward.name} (rechazada)`
          }
        })

        await transaction.studentReward.update({
          where: { id: studentRewardId },
          data: {
            status: "RECHAZADO",
            reviewedAt: new Date(),
            reviewedBy: teacherUserId,
            reviewNote: typeof comment === "string" && comment.trim() ? comment.trim() : null
          }
        })

        // Notificar al estudiante
        await transaction.notification.create({
          data: {
            userId: studentReward.studentId,
            title: "Recompensa rechazada",
            message: `Tu solicitud para "${studentReward.reward.name}" fue rechazada.${typeof comment === "string" && comment.trim() ? ` Comentario: ${comment.trim()}` : ""} Se te reembolsaron ${studentReward.pointsSpent} puntos.`,
            type: "SOLICITUD_RECOMPENSA",
            link: "/recompensas"
          }
        })
      }

      // Registrar actividad
      await recordUserActivity(
        studentReward.studentId,
        approved ? ACTIVITY_ACTIONS.REWARD_APPROVED : ACTIVITY_ACTIONS.REWARD_REJECTED,
        {
          rewardId: studentReward.rewardId,
          rewardName: studentReward.reward.name,
          reviewedBy: teacherUserId,
          comment: comment || null,
        }
      )
    })

    return NextResponse.json({ success: true, status: approved ? "APROBADO" : "RECHAZADO" })
  } catch (error) {
    console.error("Error reviewing reward:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
