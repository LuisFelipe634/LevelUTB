import { PrismaRewardServiceRepository } from "@/infrastructure/rewards/repositories/prismaRewardRepository"
import type { RewardServiceRepository } from "@/domain/rewards/repositories/rewardRepository"
import { GetStudentRewardsUseCase, RedeemRewardUseCase, GetTeacherRewardsUseCase, ReviewRewardUseCase } from "@/application/rewards/use-cases/rewardUseCases"
import { getCurrentPeriod } from "@/lib/period"

let rewardServiceRepository: RewardServiceRepository | null = null

function getRewardServiceRepository(): RewardServiceRepository {
  rewardServiceRepository ??= new PrismaRewardServiceRepository()
  return rewardServiceRepository
}

export function getGetStudentRewardsUseCase(): GetStudentRewardsUseCase {
  return new GetStudentRewardsUseCase(getRewardServiceRepository())
}

export function getRedeemRewardUseCase(): RedeemRewardUseCase {
  return new RedeemRewardUseCase(getRewardServiceRepository())
}

export function getGetTeacherRewardsUseCase(): GetTeacherRewardsUseCase {
  return new GetTeacherRewardsUseCase(getRewardServiceRepository())
}

export function getReviewRewardUseCase(): ReviewRewardUseCase {
  return new ReviewRewardUseCase(getRewardServiceRepository())
}

export { getCurrentPeriod }