import type { Reward, StudentReward, EnrolledCourse, RewardsStats, TeacherRewardsResponse, RedemptionInput, ReviewInput } from "../types"

export interface RewardRepository {
  findActiveRewards(): Promise<Reward[]>
  findById(rewardId: string): Promise<Reward | null>
}

export interface StudentRewardRepository {
  findByStudentId(studentId: string): Promise<StudentReward[]>
  findByStudentIdAndRewardIdAndCourseId(studentId: string, rewardId: string, courseId: string, status: string): Promise<StudentReward | null>
  countByStudentIdAndRewardId(studentId: string, rewardId: string, excludeStatus?: string): Promise<number>
  create(data: { studentId: string; rewardId: string; courseId: string; status: string; pointsSpent: number; evidence: string | null; expiresAt: Date }): Promise<StudentReward>
  update(id: string, data: Partial<StudentReward>): Promise<StudentReward>
  findById(studentRewardId: string): Promise<StudentReward | null>
  findPendingByStudentIds(studentIds: string[], courseIds: string[]): Promise<StudentReward[]>
  findReviewedByStudentIds(studentIds: string[], courseIds: string[], take?: number): Promise<StudentReward[]>
}

export interface PointRepository {
  sumByUserId(userId: string): Promise<number>
  create(data: { userId: string; amount: number; source: string; description: string }): Promise<void>
}

export interface RewardServiceRepository {
  getStudentRewardsWithEligibility(studentId: string, period: string): Promise<{
    rewards: Reward[]
    studentRewards: StudentReward[]
    enrolledCourses: EnrolledCourse[]
    totalPoints: number
    stats: RewardsStats
  }>
  redeemReward(studentId: string, input: RedemptionInput): Promise<StudentReward>
  getTeacherRewards(teacherUserId: string): Promise<TeacherRewardsResponse>
  reviewReward(teacherUserId: string, input: ReviewInput): Promise<{ success: boolean; status: "APROBADO" | "RECHAZADO" }>
}