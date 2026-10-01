import type { Mission as PrismaMission, StudentMission as PrismaStudentMission, StudentMission as PrismaStudentMissionModel, MissionType } from "@prisma/client"

export type MissionTypeEnum = MissionType
export type StudentMissionStatusEnum = PrismaStudentMissionModel["status"]

export interface VerificationProfile {
  enrollments: Array<{
    status: string
    semesterCode: string
    courseId: string
    course: { credits: number } | null
    source?: string
    grade?: number | null
  }>
  academicHistory: Array<{ grade: number | null; status?: string; source?: string; credits?: number }>
  averageGrade: number
  currentSemester: number
}

export interface Mission {
  id: string
  title: string
  description: string
  type: MissionTypeEnum
  pointsReward: number
  autoVerify: boolean
  verificationKey: string | null
  verificationValue: string | null
  requiredLevel: number | null
  isActive: boolean
  startDate: Date | null
  endDate: Date | null
  courseId: string | null
  course: { id: string; name: string; code: string } | null
}

export interface StudentMission {
  id: string
  studentId: string
  missionId: string
  status: StudentMissionStatusEnum
  progress: number
  evidence: string | null
  metadata: string | null
  completedAt: Date | null
  verifiedBy: string | null
  verifiedAt: Date | null
  reviewComment: string | null
  createdAt: Date
  mission: Mission
}

export interface VerificationResult {
  passed: boolean
  progress: number
  message: string
}

export interface MissionWithStudentStatus extends Mission {
  studentMissionId: string | null
  status: StudentMissionStatusEnum | "NO_ASIGNADA"
  progress: number
  completedAt: Date | null
  evidence: string | null
  reviewComment: string | null
}

export interface MissionsStats {
  total: number
  pending: number
  inProgress: number
  completed: number
  totalPointsEarned: number
}

export function toMissionDomain(prismaMission: PrismaMission & { course: { id: string; name: string; code: string } | null }): Mission {
  return {
    id: prismaMission.id,
    title: prismaMission.title,
    description: prismaMission.description,
    type: prismaMission.type,
    pointsReward: prismaMission.pointsReward,
    autoVerify: prismaMission.autoVerify,
    verificationKey: prismaMission.verificationKey,
    verificationValue: prismaMission.verificationValue,
    requiredLevel: prismaMission.requiredLevel,
    isActive: prismaMission.isActive,
    startDate: prismaMission.startDate,
    endDate: prismaMission.endDate,
    courseId: prismaMission.courseId,
    course: prismaMission.course,
  }
}

export function toStudentMissionDomain(
  prismaStudentMission: PrismaStudentMission & { mission: PrismaMission & { course: { id: string; name: string; code: string } | null } }
): StudentMission {
  return {
    id: prismaStudentMission.id,
    studentId: prismaStudentMission.studentId,
    missionId: prismaStudentMission.missionId,
    status: prismaStudentMission.status,
    progress: prismaStudentMission.progress,
    evidence: prismaStudentMission.evidence,
    metadata: prismaStudentMission.metadata,
    completedAt: prismaStudentMission.completedAt,
    verifiedBy: prismaStudentMission.verifiedBy,
    verifiedAt: prismaStudentMission.verifiedAt,
    reviewComment: prismaStudentMission.reviewComment,
    createdAt: prismaStudentMission.createdAt,
    mission: toMissionDomain(prismaStudentMission.mission),
  }
}

export function toMissionWithStudentStatus(
  mission: Mission,
  studentMission: PrismaStudentMission | null
): MissionWithStudentStatus {
  return {
    ...mission,
    studentMissionId: studentMission?.id ?? null,
    status: studentMission?.status ?? "NO_ASIGNADA",
    progress: studentMission?.progress ?? 0,
    completedAt: studentMission?.completedAt ?? null,
    evidence: studentMission?.evidence ?? null,
    reviewComment: studentMission?.reviewComment ?? null,
  }
}