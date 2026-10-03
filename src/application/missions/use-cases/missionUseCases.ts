import type { MissionWithStudentStatus, MissionsStats } from "@/domain/missions/types"
import type { MissionServiceRepository, VerificationResult } from "@/domain/missions/repositories/missionRepository"

export interface GetMissionsResult {
  missions: MissionWithStudentStatus[]
  stats: MissionsStats
}

export interface AcceptMissionResult {
  studentMission: {
    id: string
    studentId: string
    missionId: string
    status: string
    progress: number
  }
}

export interface StartMissionResult {
  studentMission: {
    id: string
    studentId: string
    missionId: string
    status: string
    progress: number
    metadata: string | null
  }
}

export interface CompleteMissionResult {
  studentMission: {
    id: string
    studentId: string
    missionId: string
    status: string
    progress: number
    completedAt: Date | null
    evidence: string | null
  }
}

export interface MissionActionInput {
  missionId: string
  action: "accept" | "start" | "complete"
  evidence?: string
}

export class GetMissionsUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(studentId: string, studentLevel: number): Promise<GetMissionsResult> {
    return this.missionServiceRepository.getMissionsWithStudentStatus(studentId, studentLevel)
  }
}

export class AcceptMissionUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(studentId: string, missionId: string): Promise<AcceptMissionResult> {
    const studentMission = await this.missionServiceRepository.acceptMission(studentId, missionId)
    return { studentMission }
  }
}

export class StartMissionUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(studentId: string, missionId: string, metadata: string | null): Promise<StartMissionResult> {
    const studentMission = await this.missionServiceRepository.startMission(studentId, missionId, metadata)
    return { studentMission }
  }
}

export class CompleteMissionUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(
    studentId: string,
    missionId: string,
    evidence: string | null,
    verificationResult: VerificationResult | null
  ): Promise<CompleteMissionResult> {
    const studentMission = await this.missionServiceRepository.completeMission(
      studentId,
      missionId,
      evidence,
      verificationResult
    )
    return { studentMission }
  }
}

export class VerifyMissionUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(
    mission: { verificationKey: string | null; verificationValue: string | null },
    userId: string,
    metadata: string | null
  ): Promise<VerificationResult> {
    return this.missionServiceRepository.verifyMission(mission, userId, metadata)
  }
}

export class AwardPointsUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(userId: string, amount: number, source: string, description: string, referenceKey?: string): Promise<number> {
    return this.missionServiceRepository.awardPoints(userId, amount, source, description, referenceKey)
  }
}

export class CreateNotificationUseCase {
  constructor(private readonly missionServiceRepository: MissionServiceRepository) {}

  async execute(userId: string, title: string, message: string, type: string, link: string): Promise<void> {
    return this.missionServiceRepository.createNotification(userId, title, message, type, link)
  }
}