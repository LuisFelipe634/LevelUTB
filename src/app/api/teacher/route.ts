import { calculateStreak } from "@/lib/streak"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAverageGrade, getCurrentSemester } from "@/lib/academic"
import { requireRole, jsonUnauthorized, jsonForbidden } from "@/lib/session"
import { getBadgeSource } from "@/lib/getBadgeSource"

export async function GET() {
  const session = await requireRole("TEACHER")

  if (session.error) {
    if (session.status === 401) {
      return jsonUnauthorized(session.error)
    }
    return jsonForbidden(session.error)
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
          include: {
            assignedCourses: { include: { course: { include: { semester: true } } } }
          }
        }
      }
    })
    const assignedCourses = teacher?.teacherProfile?.assignedCourses ?? []
    const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId)
    const assignedPeriods = [...new Set(assignedCourses.map((assignment) => assignment.period))]

    const students = await prisma.user.findMany({
      where: {
        role: "STUDENT",
        studentProfile: {
          is: {
            enrollments: {
              some: {
                courseId: { in: assignedCourseIds },
                status: { in: ["CURSANDO", "INSCRITO"] as const },
                ...(assignedPeriods.length ? { semesterCode: { in: assignedPeriods } } : {}),
              },
            },
          }
        }
      },
      orderBy: { name: "asc" },
      include: {
        studentProfile: {
          include: {
            program: { include: { courses: { include: { semester: true, prerequisites: { include: { prerequisite: true } } } } } },
            enrollments: { include: { course: { include: { semester: true } } } },
            academicHistory: true,
            recommendations: { orderBy: { priority: "asc" }, take: 3 }
          }
        },
        badges: { include: { badge: true }, orderBy: { earnedAt: "desc" } },
        points: { orderBy: { createdAt: "desc" }, take: 20 },
        rewards: { include: { reward: true, course: { include: { semester: true } } }, orderBy: { requestedAt: "desc" } },
        missions: { where: { status: "EN_REVISION" }, include: { mission: { include: { course: true } } }, orderBy: { completedAt: "asc" } }
      }
    })

    const streakActivities = await prisma.activity.findMany({
      where: { userId: { in: students.map((student) => student.id) }, action: "ACADEMIC_DAILY_ACTIVITY" },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: "desc" }
    })

    const badgeSource = getBadgeSource()
    const badgeCatalogs = await Promise.all(
      students.map(async (student) => {
        const studentCode = student.studentProfile?.studentCode
        if (!studentCode) return { studentId: student.id, badges: [] as Awaited<ReturnType<typeof badgeSource.getStudentBadges>>["badges"] }

        try {
          const catalog = await badgeSource.getStudentBadges(studentCode)
          return { studentId: student.id, badges: catalog.badges.filter((badge) => badge.earned) }
        } catch (error) {
          console.error(`[api/teacher] no se pudieron cargar insignias de ${studentCode}:`, error)
          return {
            studentId: student.id,
            badges: student.badges.map(({ badge, earnedAt, evidence }) => ({
              code: badge.id,
              name: badge.name,
              description: badge.description,
              iconUrl: badge.iconUrl,
              category: badge.category,
              requiredLevel: badge.requiredLevel,
              pointsRequired: badge.pointsRequired,
              earned: true,
              earnedAt,
              evidence,
              progressCurrent: 1,
              progressTarget: 1,
            }))
          }
        }
      })
    )
    const badgesByStudentId = new Map(badgeCatalogs.map((catalog) => [catalog.studentId, catalog.badges]))

    const data = students.flatMap((student) => {
      const profile = student.studentProfile
      if (!profile) return []

      const approvedCodes = new Set(
        profile.enrollments.filter((enrollment) => enrollment.status === "APROBADO").map((enrollment) => enrollment.course.code)
      )
      const suggestedCourses = profile.program.courses
        .filter((course) => !approvedCodes.has(course.code))
        .filter((course) => course.prerequisites.every(({ prerequisite }) => approvedCodes.has(prerequisite.code)))
        .sort((first, second) => first.semester.number - second.semester.number)
        .slice(0, 3)

      const period = assignedPeriods[0] || undefined
      const currentSemester = getCurrentSemester(profile.enrollments, profile.currentSemester, period)
      const averageGrade = getAverageGrade(profile.academicHistory, profile.enrollments, profile.averageGrade)
      const approvedCredits = Array.from(new Map(profile.enrollments.filter((enrollment) => enrollment.status === "APROBADO").map((enrollment) => [enrollment.courseId, enrollment.course.credits])).values()).reduce((total, credits) => total + credits, 0)
      let academicRisk: string | null = null
      if (averageGrade < 3) academicRisk = "Requiere acompañamiento por promedio bajo"
      else if (approvedCredits < currentSemester * 12) academicRisk = "Avance de créditos por debajo de lo esperado"
      const assignedStudentRewards = student.rewards.filter((reward) => assignedCourseIds.includes(reward.courseId) && (assignedPeriods.length === 0 || profile.enrollments.some((enrollment) => enrollment.courseId === reward.courseId && assignedPeriods.includes(enrollment.semesterCode))))
      const pendingRewards = assignedStudentRewards.filter((reward) => reward.status === "SOLICITADO")
      const rewardStatuses = [...new Set(assignedStudentRewards.map((reward) => reward.status))]
      const earnedBadges = badgesByStudentId.get(student.id) || []

      return [{
        id: student.id,
        name: student.name,
        email: student.email,
        studentCode: profile.studentCode,
        program: profile.program.name,
        semester: currentSemester,
        averageGrade,
        totalCredits: approvedCredits,
        totalProgramCredits: profile.program.totalCredits,
        totalPoints: student.points.reduce((total, point) => total + point.amount, 0),
        earnedBadgesCount: earnedBadges.length,
        badges: earnedBadges.map((badge) => ({ name: badge.name, icon: badge.iconUrl, category: badge.category, earnedAt: badge.earnedAt, evidence: badge.evidence, progressCurrent: 1, progressTarget: 1 })),
        rewardStatus: (() => {
          if (pendingRewards.length) return "PENDIENTE"
          if (rewardStatuses.includes("APROBADO")) return "APROBADO"
          if (rewardStatuses.length) return "REALIZADO"
          return "SIN_NOVEDADES"
        })(),
        pendingRewardsCount: pendingRewards.length,
        pendingRewardCourseIds: pendingRewards.map((reward) => reward.courseId),
        rewardHistory: assignedStudentRewards.map((reward) => ({ id: reward.id, name: reward.reward.name, status: reward.status, pointsSpent: reward.pointsSpent, courseCode: reward.course.code, requestedAt: reward.requestedAt, reviewedAt: reward.reviewedAt })),
        completedCourses: profile.enrollments.filter((enrollment) => enrollment.status === "APROBADO").length,
        currentCourses: profile.enrollments.filter((enrollment) => enrollment.status === "CURSANDO").map((enrollment) => ({ code: enrollment.course.code, name: enrollment.course.name, credits: enrollment.course.credits, period: enrollment.semesterCode })),
        recommendations: profile.recommendations.map(({ title, description, priority }) => ({ title, description, priority })),
        suggestedCourses: suggestedCourses.map((course) => ({ code: course.code, name: course.name, credits: course.credits, semester: course.semester.number })),
        streak: calculateStreak(streakActivities.filter((activity) => activity.userId === student.id)),
        risk: academicRisk,
        pendingMissions: student.missions.map(({ id, mission, evidence, completedAt, status }) => ({ id, title: mission.title, description: mission.description, points: mission.pointsReward, evidence, completedAt, status, course: mission.course ? { code: mission.course.code, name: mission.course.name } : null }))
        ,assignedCourseIds: profile.enrollments.filter((enrollment) => assignedCourseIds.includes(enrollment.courseId) && ["CURSANDO","INSCRITO"].includes(enrollment.status) && (assignedPeriods.length === 0 || assignedPeriods.includes(enrollment.semesterCode))).map((enrollment) => enrollment.courseId)
      }]
    })

    const courses = assignedCourses.map((assignment) => ({
      id: assignment.course.id,
      code: assignment.course.code,
      name: assignment.course.name,
      semester: assignment.course.semester.number,
      period: assignment.period,
      students: data.filter((student) => student.assignedCourseIds.includes(assignment.courseId)).map((student) => ({
        id: student.id,
        name: student.name,
        studentCode: student.studentCode,
        averageGrade: student.averageGrade,
        totalCredits: student.totalCredits,
        risk: student.risk,
        totalPoints: student.totalPoints,
        earnedBadgesCount: student.earnedBadgesCount,
        badges: student.badges,
        rewardStatus: student.rewardStatus,
        rewardHistory: student.rewardHistory,
        pendingRewardsCount: student.pendingRewardCourseIds.filter((courseId) => courseId === assignment.courseId).length
      }))
    }))

    const missionHistory = await prisma.studentMission.findMany({
      where: { studentId: { in: students.map((student) => student.id) }, status: "VERIFICADA" },
      include: {
        mission: true,
        student: {
          select: { id: true, name: true, studentProfile: { select: { studentCode: true } } }
        }
      },
      orderBy: { verifiedAt: "desc" },
      take: 50
    })

    return NextResponse.json({
      teacher: teacher ? {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        profile: teacher.teacherProfile
      } : null,
      courses,
      students: data,
      pendingMissions: data.flatMap((student) => student.pendingMissions.map((mission) => ({ ...mission, studentId: student.id, studentName: student.name, studentCode: student.studentCode }))),
      missionHistory: missionHistory.map((historyItem) => ({
        id: historyItem.id,
        studentId: historyItem.student.id,
        studentName: historyItem.student.name,
        studentCode: historyItem.student.studentProfile?.studentCode,
        title: historyItem.mission.title,
        points: historyItem.mission.pointsReward,
        verifiedAt: historyItem.verifiedAt
      }))
    })
  } catch (error) {
    console.error("Error fetching teacher data:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  const session = await requireRole("TEACHER")

  if (session.error) {
    if (session.status === 401) {
      return jsonUnauthorized(session.error)
    }
    return jsonForbidden(session.error)
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
    const { studentMissionId, decision, comment } = body as {
      studentMissionId?: unknown
      decision?: unknown
      comment?: unknown
    }
    if (typeof studentMissionId !== "string" || !["approve", "reject"].includes(decision as string)) {
      return NextResponse.json({ error: "Decisión de revisión inválida" }, { status: 400 })
    }
    if (typeof comment === "string" && comment.length > 2000) {
      return NextResponse.json({ error: "El comentario no puede superar 2000 caracteres" }, { status: 400 })
    }

    const studentMission = await prisma.studentMission.findUnique({
      where: { id: studentMissionId },
      include: { mission: true, student: true }
    })
    if (studentMission?.status !== "EN_REVISION") {
      return NextResponse.json({ error: "La misión no está pendiente de revisión" }, { status: 400 })
    }

    // Solo el docente asignado al curso de la misión (o a su estudiante) puede revisarla.
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: teacherUserId },
      include: { assignedCourses: { select: { courseId: true } } },
    })
    const assignedCourseIds = new Set(
      (teacherProfile?.assignedCourses ?? []).map((a) => a.courseId)
    )
    const missionCourseId = studentMission.mission.courseId
    if (missionCourseId && !assignedCourseIds.has(missionCourseId)) {
      // Fallback: verificar matrícula vigente del estudiante en algún curso del docente.
      const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId: studentMission.studentId },
        select: { id: true },
      })
      const sharesCourse = studentProfile
        ? await prisma.enrollment.findFirst({
            where: {
              studentId: studentProfile.id,
              courseId: { in: [...assignedCourseIds] },
              status: { in: ["CURSANDO", "INSCRITO"] },
            },
            select: { id: true },
          })
        : null
      if (!sharesCourse) {
        return NextResponse.json(
          { error: "No tienes asignado el curso de esta misión" },
          { status: 403 }
        )
      }
    }

    const approved = decision === "approve"
    await prisma.$transaction(async (transaction) => {
      await transaction.studentMission.update({
        where: { id: studentMissionId },
        data: {
          status: approved ? "VERIFICADA" : "RECHAZADA",
          verifiedBy: teacherUserId,
          verifiedAt: new Date(),
          reviewComment: typeof comment === "string" ? comment.trim() || null : null
        }
      })

      if (approved) {
        await transaction.point.create({
          data: { userId: studentMission.studentId, amount: studentMission.mission.pointsReward, source: "MISION_COMPLETADA", description: `Misión verificada: ${studentMission.mission.title}` }
        })
        await transaction.activity.create({
          data: { userId: studentMission.studentId, action: "MISION_VERIFICADA", details: { missionId: studentMission.missionId, reviewedBy: teacherUserId, pointsEarned: studentMission.mission.pointsReward } }
        })
      }

      await transaction.notification.create({
        data: {
          userId: studentMission.studentId,
          title: approved ? "Misión verificada" : "Misión devuelta para revisión",
          message: (() => {
            if (approved) {
              return `Tu misión «${studentMission.mission.title}» fue aprobada y ganaste ${studentMission.mission.pointsReward} puntos.`
            }
            const commentText = typeof comment === "string" && comment.trim() ? ` Comentario: ${comment.trim()}` : ""
            return `Tu misión «${studentMission.mission.title}» necesita ajustes.${commentText}`
          })(),
          type: approved ? "LOGRO_OBTENIDO" : "WARNING",
          link: "/misiones"
        }
      })
    })

    return NextResponse.json({ success: true, status: approved ? "VERIFICADA" : "RECHAZADA" })
  } catch (error) {
    console.error("Error reviewing mission:", error)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}