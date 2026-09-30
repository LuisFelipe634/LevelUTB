import { prisma } from "@/lib/prisma"
import type { Mission, StudentMission, VerificationProfile, VerificationResult, MissionsStats, MissionWithStudentStatus } from "@/domain/missions/types"
import type { MissionRepository, StudentMissionRepository, MissionServiceRepository } from "@/domain/missions/repositories/missionRepository"
import { toMissionDomain, toStudentMissionDomain, toMissionWithStudentStatus } from "@/domain/missions/types"
import { verifyMission } from "@/domain/missions/missionVerificationService"

type DomainVerificationProfile = VerificationProfile

export class PrismaMissionRepository implements MissionRepository {
  async findAvailableForStudent(studentId: string, studentLevel: number): Promise<Mission[]> {
    const missions = await prisma.mission.findMany({
      where: {
        isActive: true,
        OR: [
          { requiredLevel: null },
          { requiredLevel: { lte: studentLevel } },
        ],
      },
      include: {
        course: true,
      },
    })

    return missions.map(toMissionDomain)
  }

  async findById(missionId: string): Promise<Mission | null> {
    const mission = await prisma.mission.findUnique({
      where: { id: missionId },
      include: { course: true },
    })

    return mission ? toMissionDomain(mission) : null
  }

  async findByIdWithCourse(missionId: string): Promise<Mission | null> {
    return this.findById(missionId)
  }
}

export class PrismaStudentMissionRepository implements StudentMissionRepository {
  async findByStudentId(studentId: string): Promise<StudentMission[]> {
    const studentMissions = await prisma.studentMission.findMany({
      where: { studentId },
      include: {
        mission: {
          include: { course: true },
        },
      },
    })

    return studentMissions.map(toStudentMissionDomain)
  }

  async findByStudentIdAndMissionId(studentId: string, missionId: string): Promise<StudentMission | null> {
    const studentMission = await prisma.studentMission.findUnique({
      where: {
        studentId_missionId: {
          studentId,
          missionId,
        },
      },
      include: {
        mission: {
          include: { course: true },
        },
      },
    })

    return studentMission ? toStudentMissionDomain(studentMission) : null
  }

  async create(data: { studentId: string; missionId: string; status: string; progress: number }): Promise<StudentMission> {
    const studentMission = await prisma.studentMission.create({
      data: {
        studentId: data.studentId,
        missionId: data.missionId,
        status: data.status as "PENDIENTE",
        progress: data.progress,
      },
      include: {
        mission: {
          include: { course: true },
        },
      },
    })

    return toStudentMissionDomain(studentMission)
  }

  async update(id: string, data: Partial<StudentMission>): Promise<StudentMission> {
    const studentMission = await prisma.studentMission.update({
      where: { id },
      data: {
        status: data.status,
        progress: data.progress,
        evidence: data.evidence,
        metadata: data.metadata,
        completedAt: data.completedAt,
        verifiedBy: data.verifiedBy,
        verifiedAt: data.verifiedAt,
        reviewComment: data.reviewComment,
      },
      include: {
        mission: {
          include: { course: true },
        },
      },
    })

    return toStudentMissionDomain(studentMission)
  }
}

export class PrismaMissionServiceRepository implements MissionServiceRepository {
  private missionRepository: PrismaMissionRepository
  private studentMissionRepository: PrismaStudentMissionRepository

  constructor() {
    this.missionRepository = new PrismaMissionRepository()
    this.studentMissionRepository = new PrismaStudentMissionRepository()
  }

  async getMissionsWithStudentStatus(studentId: string, studentLevel: number): Promise<{
    missions: MissionWithStudentStatus[]
    stats: MissionsStats
  }> {
    const [availableMissions, studentMissions] = await Promise.all([
      this.missionRepository.findAvailableForStudent(studentId, studentLevel),
      this.studentMissionRepository.findByStudentId(studentId),
    ])

    const missions = availableMissions.map((mission) => {
      const studentMission = studentMissions.find((sm) => sm.missionId === mission.id)
      return toMissionWithStudentStatus(mission, studentMission ?? null)
    })

    const totalPointsFromMissions = studentMissions
      .filter((sm) => sm.status === "COMPLETADA" || sm.status === "VERIFICADA")
      .reduce((acc, sm) => acc + sm.mission.pointsReward, 0)

    return {
      missions,
      stats: {
        total: missions.length,
        pending: missions.filter((m) => m.status === "PENDIENTE" || m.status === "NO_ASIGNADA").length,
        inProgress: missions.filter((m) => m.status === "EN_PROGRESO").length,
        completed: missions.filter((m) => m.status === "COMPLETADA" || m.status === "VERIFICADA").length,
        totalPointsEarned: totalPointsFromMissions,
      },
    }
  }

  async acceptMission(studentId: string, missionId: string): Promise<StudentMission> {
    return this.studentMissionRepository.create({
      studentId,
      missionId,
      status: "PENDIENTE",
      progress: 0,
    })
  }

  async startMission(studentId: string, missionId: string, metadata: string | null): Promise<StudentMission> {
    const existingMission = await this.studentMissionRepository.findByStudentIdAndMissionId(studentId, missionId)
    if (!existingMission) {
      throw new Error("Student mission not found")
    }

    return this.studentMissionRepository.update(existingMission.id, {
      status: "EN_PROGRESO",
      progress: 0,
      completedAt: null,
      evidence: null,
      metadata,
      verifiedBy: null,
      verifiedAt: null,
      reviewComment: null,
    })
  }

  async completeMission(
    studentId: string,
    missionId: string,
    evidence: string | null,
    verificationResult: VerificationResult | null
  ): Promise<StudentMission> {
    const existingMission = await this.studentMissionRepository.findByStudentIdAndMissionId(studentId, missionId)
    if (!existingMission) {
      throw new Error("Student mission not found")
    }

    const mission = await this.missionRepository.findByIdWithCourse(missionId)
    if (!mission) {
      throw new Error("Mission not found")
    }

    const status = mission.autoVerify ? "COMPLETADA" : "EN_REVISION"
    const finalEvidence = mission.autoVerify
      ? verificationResult?.message
        ? `Cumplimiento registrado automáticamente — ${verificationResult.message}`
        : "Cumplimiento registrado automáticamente"
      : evidence

    return this.studentMissionRepository.update(existingMission.id, {
      status: status as "COMPLETADA" | "EN_REVISION",
      progress: 100,
      completedAt: new Date(),
      evidence: finalEvidence,
    })
  }

  async getVerificationProfile(userId: string): Promise<VerificationProfile | null> {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: {
        enrollments: { include: { course: true } },
        academicHistory: true,
      },
    })

    if (!profile) return null

    return {
      enrollments: profile.enrollments.map((e) => ({
        status: e.status,
        semesterCode: e.semesterCode,
        courseId: e.courseId,
        course: e.course ? { credits: e.course.credits } : null,
        source: (e as { source?: string }).source,
        grade: (e as { grade?: number | null }).grade ?? null,
      })),
      academicHistory: profile.academicHistory.map((h) => ({
        grade: h.grade,
        status: h.status,
        source: (h as { source?: string }).source,
        credits: h.credits,
      })),
      averageGrade: profile.averageGrade,
      currentSemester: profile.currentSemester,
    }
  }

  async verifyMission(
    mission: { verificationKey: string | null; verificationValue: string | null },
    userId: string,
    metadata: string | null
  ): Promise<VerificationResult> {
    const profile = await this.getVerificationProfile(userId)
    if (!profile) {
      return { passed: false, progress: 0, message: "Perfil del estudiante no encontrado" }
    }

    return verifyMission(mission, userId, metadata, profile as DomainVerificationProfile)
  }

  async awardPoints(userId: string, amount: number, source: string, description: string): Promise<void> {
    await prisma.point.create({
      data: {
        userId,
        amount,
        source: source as "MISION_COMPLETADA",
        description,
      },
    })
  }

  async createNotification(userId: string, title: string, message: string, type: string, link: string): Promise<void> {
    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type: type as "LOGRO_OBTENIDO" | "INFO" | "MISION_DISPONIBLE",
        link,
      },
    })
  }
}