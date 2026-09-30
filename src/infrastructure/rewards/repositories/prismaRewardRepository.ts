import { prisma } from "@/lib/prisma"
import type { Reward, StudentReward, EnrolledCourse, RewardsStats, TeacherRewardsResponse, TeacherRewardPending, TeacherRewardReviewed } from "@/domain/rewards/types"
import type { RewardRepository, StudentRewardRepository, PointRepository, RewardServiceRepository } from "@/domain/rewards/repositories/rewardRepository"
import { toRewardDomain, toStudentRewardDomain } from "@/domain/rewards/types"
import { buildRewardWithEligibility, buildStats, getCurrentPeriod, validateTeacherAssignment } from "@/domain/rewards/rewardRules"

export class PrismaRewardRepository implements RewardRepository {
  async findActiveRewards(): Promise<Reward[]> {
    const rewards = await prisma.reward.findMany({
      where: { isActive: true },
      orderBy: { cost: "asc" },
    })
    return rewards.map(toRewardDomain)
  }

  async findById(rewardId: string): Promise<Reward | null> {
    const reward = await prisma.reward.findUnique({ where: { id: rewardId } })
    return reward ? toRewardDomain(reward) : null
  }
}

export class PrismaStudentRewardRepository implements StudentRewardRepository {
  async findByStudentId(studentId: string): Promise<StudentReward[]> {
    const studentRewards = await prisma.studentReward.findMany({
      where: { studentId },
      include: { reward: true, course: { include: { semester: true } } },
    })
    return studentRewards.map(toStudentRewardDomain)
  }

  async findByStudentIdAndRewardIdAndCourseId(studentId: string, rewardId: string, courseId: string, status: string): Promise<StudentReward | null> {
    const studentReward = await prisma.studentReward.findFirst({
      where: { studentId, rewardId, courseId, status: status as "SOLICITADO" },
      include: { reward: true, course: { include: { semester: true } } },
    })
    return studentReward ? toStudentRewardDomain(studentReward) : null
  }

  async countByStudentIdAndRewardId(studentId: string, rewardId: string, excludeStatus?: string): Promise<number> {
    return prisma.studentReward.count({
      where: {
        studentId,
        rewardId,
        status: excludeStatus ? { not: excludeStatus as "RECHAZADO" } : undefined,
      },
    })
  }

  async create(data: { studentId: string; rewardId: string; courseId: string; status: string; pointsSpent: number; evidence: string | null; expiresAt: Date }): Promise<StudentReward> {
    const studentReward = await prisma.studentReward.create({
      data: {
        studentId: data.studentId,
        rewardId: data.rewardId,
        courseId: data.courseId,
        status: data.status as "SOLICITADO",
        pointsSpent: data.pointsSpent,
        evidence: data.evidence,
        expiresAt: data.expiresAt,
      },
      include: { reward: true, course: { include: { semester: true } } },
    })
    return toStudentRewardDomain(studentReward)
  }

  async update(id: string, data: Partial<StudentReward>): Promise<StudentReward> {
    const studentReward = await prisma.studentReward.update({
      where: { id },
      data: {
        status: data.status,
        pointsSpent: data.pointsSpent,
        reviewedAt: data.reviewedAt,
        reviewedBy: data.reviewedBy,
        reviewNote: data.reviewNote,
        evidence: data.evidence,
        expiresAt: data.expiresAt,
      },
      include: { reward: true, course: { include: { semester: true } } },
    })
    return toStudentRewardDomain(studentReward)
  }

  async findById(studentRewardId: string): Promise<StudentReward | null> {
    const studentReward = await prisma.studentReward.findUnique({
      where: { id: studentRewardId },
      include: { reward: true, course: { include: { semester: true } }, student: { select: { id: true, name: true, email: true, studentProfile: { select: { studentCode: true } } } } },
    })
    return studentReward ? toStudentRewardDomain(studentReward) : null
  }

  async findPendingByStudentIds(studentIds: string[], courseIds: string[]): Promise<StudentReward[]> {
    const studentRewards = await prisma.studentReward.findMany({
      where: {
        studentId: { in: studentIds },
        courseId: { in: courseIds },
        status: "SOLICITADO",
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: { select: { studentCode: true, enrollments: { where: { courseId: { in: courseIds }, status: { in: ["CURSANDO", "INSCRITO"] as const } }, select: { courseId: true, semesterCode: true, course: { select: { id: true, code: true, name: true, semester: { select: { number: true } } } } } } } },
          },
        },
        course: { include: { semester: true } },
        reward: true,
      },
      orderBy: { requestedAt: "asc" },
    })
    return studentRewards.map(toStudentRewardDomain)
  }

  async findReviewedByStudentIds(studentIds: string[], courseIds: string[], take = 50): Promise<StudentReward[]> {
    const studentRewards = await prisma.studentReward.findMany({
      where: {
        studentId: { in: studentIds },
        courseId: { in: courseIds },
        status: { in: ["APROBADO", "RECHAZADO"] as const },
      },
      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: { select: { studentCode: true } },
          },
        },
        course: { include: { semester: true } },
        reward: true,
      },
      orderBy: { reviewedAt: "desc" },
      take,
    })
    return studentRewards.map(toStudentRewardDomain)
  }
}

export class PrismaPointRepository implements PointRepository {
  async sumByUserId(userId: string): Promise<number> {
    const points = await prisma.point.groupBy({
      by: ["source"],
      where: { userId },
      _sum: { amount: true },
    })
    return points.reduce((acc, p) => acc + (p._sum.amount || 0), 0)
  }

  async create(data: { userId: string; amount: number; source: string; description: string }): Promise<void> {
    await prisma.point.create({
      data: {
        userId: data.userId,
        amount: data.amount,
        source: data.source as "MISION_COMPLETADA" | "CANJE_RECOMPENSA" | "RENDIMIENTO_ACADEMICO" | "MEJORA_PROMEDIO" | "CONSISTENCIA" | "IMPACTO_SOCIAL" | "EVENTO_ESPECIAL",
        description: data.description,
      },
    })
  }
}

export class PrismaRewardServiceRepository implements RewardServiceRepository {
  private rewardRepository: PrismaRewardRepository
  private studentRewardRepository: PrismaStudentRewardRepository
  private pointRepository: PrismaPointRepository

  constructor() {
    this.rewardRepository = new PrismaRewardRepository()
    this.studentRewardRepository = new PrismaStudentRewardRepository()
    this.pointRepository = new PrismaPointRepository()
  }

  async getStudentRewardsWithEligibility(studentId: string, period: string): Promise<{
    rewards: Reward[]
    studentRewards: StudentReward[]
    enrolledCourses: EnrolledCourse[]
    totalPoints: number
    stats: RewardsStats
  }> {
    const [rewards, studentRewards, totalPoints, profile] = await Promise.all([
      this.rewardRepository.findActiveRewards(),
      this.studentRewardRepository.findByStudentId(studentId),
      this.pointRepository.sumByUserId(studentId),
      prisma.studentProfile.findUnique({
        where: { userId: studentId },
        include: {
          enrollments: {
            where: {
              semesterCode: period,
              status: { in: ["CURSANDO", "INSCRITO"] },
              source: "UNIVERSITY",
            },
            include: { course: { include: { semester: true } } },
          },
        },
      }),
    ])

    const { filterRewardEligibleCourses } = await import("@/lib/academic")
    const enrolledCourses = filterRewardEligibleCourses(profile?.enrollments ?? [], period)

    const rewardsWithEligibility = rewards.map((reward) =>
      buildRewardWithEligibility(reward, studentRewards, totalPoints)
    )

    const stats = buildStats(rewardsWithEligibility, studentRewards)
    stats.totalPoints = totalPoints

    return { rewards, studentRewards, enrolledCourses, totalPoints, stats }
  }

  async redeemReward(studentId: string, input: { rewardId: string; courseId: string; evidence?: string }): Promise<StudentReward> {
    const reward = await this.rewardRepository.findById(input.rewardId)
    if (!reward || !reward.isActive) {
      throw new Error("REWARD_NOT_FOUND")
    }

    const period = getCurrentPeriod()
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      include: {
        enrollments: {
          where: {
            semesterCode: period,
            status: { in: ["CURSANDO", "INSCRITO"] },
            source: "UNIVERSITY",
          },
          include: { course: { include: { semester: true } } },
        },
      },
    })

    const { filterRewardEligibleCourses } = await import("@/lib/academic")
    const enrolledCourses = filterRewardEligibleCourses(profile?.enrollments ?? [], period)
    const isEligibleCourse = enrolledCourses.some((course) => course.id === input.courseId)

    if (!isEligibleCourse) {
      throw new Error("INELIGIBLE_COURSE")
    }

    const existingUses = await this.studentRewardRepository.countByStudentIdAndRewardId(studentId, input.rewardId, "RECHAZADO")
    if (reward.maxUses !== null && existingUses >= reward.maxUses) {
      throw new Error("MAX_USES_REACHED")
    }

    const totalPoints = await this.pointRepository.sumByUserId(studentId)
    if (totalPoints < reward.cost) {
      throw new Error("INSUFFICIENT_POINTS")
    }

    const pendingRequest = await this.studentRewardRepository.findByStudentIdAndRewardIdAndCourseId(studentId, input.rewardId, input.courseId, "SOLICITADO")
    if (pendingRequest) {
      throw new Error("PENDING_REQUEST_EXISTS")
    }

    const studentReward = await prisma.$transaction(async (tx) => {
      await tx.point.create({
        data: {
          userId: studentId,
          amount: -reward.cost,
          source: "CANJE_RECOMPENSA",
          description: `Canje: ${reward.name}`,
        },
      })

      const sr = await tx.studentReward.create({
        data: {
          studentId,
          rewardId: input.rewardId,
          courseId: input.courseId,
          status: "SOLICITADO",
          pointsSpent: reward.cost,
          evidence: input.evidence?.trim() || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
        include: { reward: true, course: { include: { semester: true } } },
      })

      await tx.notification.create({
        data: {
          userId: studentId,
          title: "Recompensa solicitada",
          message: `Tu solicitud para "${reward.name}" ha sido enviada y está pendiente de revisión docente. Se descontaron ${reward.cost} puntos.`,
          type: "INFO",
          link: "/recompensas",
        },
      })

      const studentProfile = await tx.studentProfile.findUnique({
        where: { userId: studentId },
        include: { enrollments: { include: { course: true } } },
      })

      if (studentProfile) {
        const teacherCourses = await tx.teacherCourse.findMany({
          where: { courseId: input.courseId },
          include: { teacher: true },
        })
        const teacherIds = [...new Set(teacherCourses.map((tc) => tc.teacher.userId))]
        for (const teacherId of teacherIds) {
          await tx.notification.create({
            data: {
              userId: teacherId,
              title: "Nueva solicitud de recompensa",
              message: `Un estudiante ha solicitado "${reward.name}" para el curso seleccionado. Revisa en el panel de docentes.`,
              type: "SOLICITUD_RECOMPENSA",
              link: "/docentes",
            },
          })
        }
      }

      return toStudentRewardDomain(sr)
    })

    return studentReward
  }

  async getTeacherRewards(teacherUserId: string): Promise<TeacherRewardsResponse> {
    const teacher = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: {
        teacherProfile: {
          include: { assignedCourses: { include: { course: { include: { semester: true } } } } },
        },
      },
    })

    const assignedCourses = teacher?.teacherProfile?.assignedCourses || []
    const assignedCourseIds = assignedCourses.map((assignment) => assignment.courseId)
    const assignedPeriods = [...new Set(assignedCourses.map((assignment) => assignment.period))]
    const courseById = new Map(assignedCourses.map((assignment) => [assignment.courseId, assignment]))

    if (assignedCourseIds.length === 0) {
      return { pending: [], reviewed: [] }
    }

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
      select: { userId: true },
    })

    const studentIds = studentProfiles.map((p) => p.userId)

    const [pendingRewards, reviewedRewards] = await Promise.all([
      this.studentRewardRepository.findPendingByStudentIds(studentIds, assignedCourseIds),
      this.studentRewardRepository.findReviewedByStudentIds(studentIds, assignedCourseIds),
    ])

    const pending: TeacherRewardPending[] = pendingRewards.map((sr) => ({
      id: sr.id,
      studentId: sr.studentId,
      studentName: sr.student?.name || "",
      studentEmail: sr.student?.email || "",
      studentCode: sr.student?.studentProfile?.studentCode || null,
      courses: [{
        id: sr.course.id,
        code: sr.course.code,
        name: sr.course.name,
        semester: sr.course.semester.number,
        period: sr.student?.studentProfile?.enrollments?.find((enrollment) => enrollment.courseId === sr.courseId)?.semesterCode || "",
        assignmentId: courseById.get(sr.courseId)?.id || null,
      }],
      reward: {
        id: sr.reward.id,
        name: sr.reward.name,
        description: sr.reward.description,
        icon: sr.reward.icon,
        category: sr.reward.category,
        cost: sr.reward.cost,
      },
      pointsSpent: sr.pointsSpent,
      evidence: sr.evidence,
      requestedAt: sr.requestedAt,
      expiresAt: sr.expiresAt,
    }))

    const reviewed: TeacherRewardReviewed[] = reviewedRewards.map((sr) => ({
      id: sr.id,
      studentId: sr.studentId,
      studentName: sr.student?.name || "",
      studentCode: sr.student?.studentProfile?.studentCode || null,
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
        semester: sr.course.semester.number,
      },
    }))

    return { pending, reviewed }
  }

  async reviewReward(teacherUserId: string, input: { studentRewardId: string; courseId?: string; decision: "approve" | "reject"; comment?: string }): Promise<{ success: boolean; status: "APROBADO" | "RECHAZADO" }> {
    const studentReward = await this.studentRewardRepository.findById(input.studentRewardId)
    if (!studentReward || studentReward.status !== "SOLICITADO") {
      throw new Error("INVALID_REQUEST")
    }

    const teacher = await prisma.user.findUnique({
      where: { id: teacherUserId },
      include: { teacherProfile: { include: { assignedCourses: true } } },
    })

    const assignedCourseIds = teacher?.teacherProfile?.assignedCourses.map((a) => a.courseId) || []
    const assignedPeriods = [...new Set(teacher?.teacherProfile?.assignedCourses.map((a) => a.period) || [])]

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: studentReward.studentId },
      include: { enrollments: { include: { course: true } } },
    })

    if (!studentProfile) {
      throw new Error("STUDENT_PROFILE_NOT_FOUND")
    }

    const validation = validateTeacherAssignment(
      studentProfile.enrollments.map((e) => ({ courseId: e.courseId, status: e.status, semesterCode: e.semesterCode })),
      assignedCourseIds,
      assignedPeriods,
      input.courseId
    )

    if (!validation.isAssigned) {
      throw new Error(validation.error || "NOT_ASSIGNED")
    }

    const approved = input.decision === "approve"

    await prisma.$transaction(async (transaction) => {
      if (approved) {
        await transaction.studentReward.update({
          where: { id: input.studentRewardId },
          data: {
            status: "APROBADO",
            reviewedAt: new Date(),
            reviewedBy: teacherUserId,
            reviewNote: typeof input.comment === "string" && input.comment.trim() ? input.comment.trim() : null,
          },
        })

        await transaction.notification.create({
          data: {
            userId: studentReward.studentId,
            title: "Recompensa aprobada",
            message: `Tu solicitud para "${studentReward.reward.name}" fue aprobada por tu docente. Ya puedes usar la bonificación (válida por 30 días).`,
            type: "SOLICITUD_RECOMPENSA",
            link: "/recompensas",
          },
        })
      } else {
        await transaction.point.create({
          data: {
            userId: studentReward.studentId,
            amount: studentReward.pointsSpent,
            source: "MISION_COMPLETADA",
            description: `Reembolso: ${studentReward.reward.name} (rechazada)`,
          },
        })

        await transaction.studentReward.update({
          where: { id: input.studentRewardId },
          data: {
            status: "RECHAZADO",
            reviewedAt: new Date(),
            reviewedBy: teacherUserId,
            reviewNote: typeof input.comment === "string" && input.comment.trim() ? input.comment.trim() : null,
          },
        })

        await transaction.notification.create({
          data: {
            userId: studentReward.studentId,
            title: "Recompensa rechazada",
            message: `Tu solicitud para "${studentReward.reward.name}" fue rechazada.${typeof input.comment === "string" && input.comment.trim() ? ` Comentario: ${input.comment.trim()}` : ""} Se te reembolsaron ${studentReward.pointsSpent} puntos.`,
            type: "SOLICITUD_RECOMPENSA",
            link: "/recompensas",
          },
        })
      }

      const { recordUserActivity, ACTIVITY_ACTIONS } = await import("@/lib/activity")
      await recordUserActivity(
        studentReward.studentId,
        approved ? ACTIVITY_ACTIONS.REWARD_APPROVED : ACTIVITY_ACTIONS.REWARD_REJECTED,
        {
          rewardId: studentReward.rewardId,
          rewardName: studentReward.reward.name,
          reviewedBy: teacherUserId,
          comment: input.comment || null,
        }
      )
    })

    return { success: true, status: approved ? "APROBADO" : "RECHAZADO" }
  }
}