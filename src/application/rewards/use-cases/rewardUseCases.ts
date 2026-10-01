import type { Reward, StudentReward, EnrolledCourse, RewardsStats, TeacherRewardsResponse, RedemptionInput, ReviewInput } from "@/domain/rewards/types"
import type { RewardServiceRepository } from "@/domain/rewards/repositories/rewardRepository"

export interface GetStudentRewardsResult {
  rewards: Reward[]
  studentRewards: StudentReward[]
  enrolledCourses: EnrolledCourse[]
  totalPoints: number
  stats: RewardsStats
}

export interface RedeemRewardResult {
  studentReward: StudentReward
}

export interface GetTeacherRewardsResult {
  pending: TeacherRewardsResponse["pending"]
  reviewed: TeacherRewardsResponse["reviewed"]
}

export interface ReviewRewardResult {
  success: boolean
  status: "APROBADO" | "RECHAZADO"
}

export class GetStudentRewardsUseCase {
  constructor(private readonly rewardServiceRepository: RewardServiceRepository) {}

  async execute(studentId: string, period: string): Promise<GetStudentRewardsResult> {
    return this.rewardServiceRepository.getStudentRewardsWithEligibility(studentId, period)
  }
}

export class RedeemRewardUseCase {
  constructor(private readonly rewardServiceRepository: RewardServiceRepository) {}

  async execute(studentId: string, input: RedemptionInput): Promise<RedeemRewardResult> {
    const studentReward = await this.rewardServiceRepository.redeemReward(studentId, input)
    return { studentReward }
  }
}

export class GetTeacherRewardsUseCase {
  constructor(private readonly rewardServiceRepository: RewardServiceRepository) {}

  async execute(teacherUserId: string): Promise<GetTeacherRewardsResult> {
    return this.rewardServiceRepository.getTeacherRewards(teacherUserId)
  }
}

export class ReviewRewardUseCase {
  constructor(private readonly rewardServiceRepository: RewardServiceRepository) {}

  async execute(teacherUserId: string, input: ReviewInput): Promise<ReviewRewardResult> {
    return this.rewardServiceRepository.reviewReward(teacherUserId, input)
  }
}