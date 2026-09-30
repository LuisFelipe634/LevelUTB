export interface RewardResponseDTO {
  id: string
  name: string
  description: string
  icon: string
  category: string
  cost: number
  maxUses: number | null
  canAfford: boolean
  canUse: boolean
  usesCount: number
  earned: {
    id: string
    status: string
    pointsSpent: number
    requestedAt: string
    reviewedAt: string | null
    reviewNote: string | null
    expiresAt: string | null
    course: {
      id: string
      code: string
      name: string
      semester: number
    }
  } | null
}

export interface EnrolledCourseResponseDTO {
  id: string
  code: string
  name: string
  semester: number
  period: string
}

export interface RewardsStatsResponseDTO {
  totalPoints: number
  totalRewards: number
  availableRewards: number
  usedRewards: number
  byCategory: Record<string, { total: number; available: number; used: number }>
}

export interface GetRewardsResponseDTO {
  rewards: RewardResponseDTO[]
  enrolledCourses: EnrolledCourseResponseDTO[]
  currentPeriod: string
  stats: RewardsStatsResponseDTO
}

export interface RedeemRewardRequestDTO {
  rewardId: string
  courseId: string
  evidence?: string
}

export interface RedeemRewardResponseDTO {
  studentReward: {
    id: string
    studentId: string
    rewardId: string
    courseId: string
    status: string
    pointsSpent: number
    requestedAt: string
    reviewedAt: string | null
    reviewNote: string | null
    evidence: string | null
    expiresAt: string | null
    reward: RewardResponseDTO
    course: {
      id: string
      code: string
      name: string
      semester: number
    }
  }
}

export interface TeacherRewardPendingResponseDTO {
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
    category: string
    cost: number
  }
  pointsSpent: number
  evidence: string | null
  requestedAt: string
  expiresAt: string | null
}

export interface TeacherRewardReviewedResponseDTO {
  id: string
  studentId: string
  studentName: string
  studentCode: string | null
  rewardName: string
  status: string
  pointsSpent: number
  reviewNote: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  course: {
    id: string
    code: string
    name: string
    semester: number
  }
}

export interface GetTeacherRewardsResponseDTO {
  pending: TeacherRewardPendingResponseDTO[]
  reviewed: TeacherRewardReviewedResponseDTO[]
}

export interface ReviewRewardRequestDTO {
  studentRewardId: string
  courseId?: string
  decision: "approve" | "reject"
  comment?: string
}

export interface ReviewRewardResponseDTO {
  success: boolean
  status: "APROBADO" | "RECHAZADO"
}

export interface ErrorResponseDTO {
  error: string
}