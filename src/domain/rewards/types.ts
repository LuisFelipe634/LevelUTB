import type { Reward as PrismaReward, StudentReward as PrismaStudentReward, RewardCategory, PointSource } from "@prisma/client"
import type { StudentReward as PrismaStudentRewardModel } from "@prisma/client"

export type RewardCategoryEnum = RewardCategory
export type RewardStatusEnum = PrismaStudentRewardModel["status"]
export type PointSourceEnum = PointSource

export interface Reward {
  id: string
  name: string
  description: string
  icon: string
  category: RewardCategoryEnum
  cost: number
  isActive: boolean
  maxUses: number | null
  createdAt: Date
  updatedAt: Date
}

export interface StudentReward {
  id: string
  studentId: string
  rewardId: string
  courseId: string
  status: RewardStatusEnum
  pointsSpent: number
  requestedAt: Date
  reviewedAt: Date | null
  reviewedBy: string | null
  reviewNote: string | null
  evidence: string | null
  expiresAt: Date | null
  reward: Reward
  course: {
    id: string
    code: string
    name: string
    semester: { number: number }
  }
  student?: {
    id: string
    name: string
    email: string
    studentProfile: { 
      studentCode: string
      enrollments?: Array<{ courseId: string; semesterCode: string; course: { id: string; code: string; name: string; semester: { number: number } } }>
    } | null
  }
}

export interface RewardWithEligibility extends Reward {
  canAfford: boolean
  canUse: boolean
  usesCount: number
  earned: {
    id: string
    status: RewardStatusEnum
    pointsSpent: number
    requestedAt: Date
    reviewedAt: Date | null
    reviewNote: string | null
    expiresAt: Date | null
    course: {
      id: string
      code: string
      name: string
      semester: number
    }
  } | null
}

export interface EnrolledCourse {
  id: string
  code: string
  name: string
  semester: number
  period: string
}

export interface RewardsStats {
  totalPoints: number
  totalRewards: number
  availableRewards: number
  usedRewards: number
  byCategory: Record<string, { total: number; available: number; used: number }>
}

export interface TeacherRewardPending {
  id: string
  studentId: string
  studentName: string
  studentEmail: string
  studentCode: string | null
  courses: Array<{
    id: string
    code: string
    name: string
    semester: number
    period: string
    assignmentId: string | null
  }>
  reward: {
    id: string
    name: string
    description: string
    icon: string
    category: RewardCategoryEnum
    cost: number
  }
  pointsSpent: number
  evidence: string | null
  requestedAt: Date
  expiresAt: Date | null
}

export interface TeacherRewardReviewed {
  id: string
  studentId: string
  studentName: string
  studentCode: string | null
  rewardName: string
  status: RewardStatusEnum
  pointsSpent: number
  reviewNote: string | null
  reviewedAt: Date | null
  reviewedBy: string | null
  course: {
    id: string
    code: string
    name: string
    semester: number
  }
}

export interface TeacherRewardsResponse {
  pending: TeacherRewardPending[]
  reviewed: TeacherRewardReviewed[]
}

export interface RedemptionInput {
  rewardId: string
  courseId: string
  evidence?: string
}

export interface ReviewInput {
  studentRewardId: string
  courseId?: string
  decision: "approve" | "reject"
  comment?: string
}

export function toRewardDomain(prismaReward: PrismaReward): Reward {
  return {
    id: prismaReward.id,
    name: prismaReward.name,
    description: prismaReward.description,
    icon: prismaReward.icon,
    category: prismaReward.category,
    cost: prismaReward.cost,
    isActive: prismaReward.isActive,
    maxUses: prismaReward.maxUses,
    createdAt: prismaReward.createdAt,
    updatedAt: prismaReward.updatedAt,
  }
}

export function toStudentRewardDomain(
  prismaStudentReward: PrismaStudentReward & { reward: PrismaReward; course: { id: string; code: string; name: string; semester: { number: number } }; student?: { id: string; name: string; email: string; studentProfile: { studentCode: string } | null } }
): StudentReward {
  return {
    id: prismaStudentReward.id,
    studentId: prismaStudentReward.studentId,
    rewardId: prismaStudentReward.rewardId,
    courseId: prismaStudentReward.courseId,
    status: prismaStudentReward.status,
    pointsSpent: prismaStudentReward.pointsSpent,
    requestedAt: prismaStudentReward.requestedAt,
    reviewedAt: prismaStudentReward.reviewedAt,
    reviewedBy: prismaStudentReward.reviewedBy,
    reviewNote: prismaStudentReward.reviewNote,
    evidence: prismaStudentReward.evidence,
    expiresAt: prismaStudentReward.expiresAt,
    reward: toRewardDomain(prismaStudentReward.reward),
    course: {
      id: prismaStudentReward.course.id,
      code: prismaStudentReward.course.code,
      name: prismaStudentReward.course.name,
      semester: prismaStudentReward.course.semester,
    },
    student: prismaStudentReward.student,
  }
}