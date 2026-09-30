import type { Mission, MissionWithStudentStatus, MissionsStats, StudentMission, VerificationResult, VerificationProfile } from "../types"

export interface MissionRepository {
  findAvailableForStudent(studentId: string, studentLevel: number): Promise<Mission[]>
  findById(missionId: string): Promise<Mission | null>
  findByIdWithCourse(missionId: string): Promise<Mission | null>
}

export interface StudentMissionRepository {
  findByStudentId(studentId: string): Promise<StudentMission[]>
  findByStudentIdAndMissionId(studentId: string, missionId: string): Promise<StudentMission | null>
  create(data: { studentId: string; missionId: string; status: string; progress: number }): Promise<StudentMission>
  update(id: string, data: Partial<StudentMission>): Promise<StudentMission>
}

export interface MissionServiceRepository {
  getMissionsWithStudentStatus(studentId: string, studentLevel: number): Promise<{
    missions: MissionWithStudentStatus[]
    stats: MissionsStats
  }>
  acceptMission(studentId: string, missionId: string): Promise<StudentMission>
  startMission(studentId: string, missionId: string, metadata: string | null): Promise<StudentMission>
  completeMission(
    studentId: string,
    missionId: string,
    evidence: string | null,
    verificationResult: VerificationResult | null
  ): Promise<StudentMission>
  getVerificationProfile(userId: string): Promise<VerificationProfile | null>
  verifyMission(
    mission: { verificationKey: string | null; verificationValue: string | null },
    userId: string,
    metadata: string | null
  ): Promise<VerificationResult>
  awardPoints(userId: string, amount: number, source: string, description: string): Promise<void>
  createNotification(userId: string, title: string, message: string, type: string, link: string): Promise<void>
}

export { VerificationResult }