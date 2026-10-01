import type { Reward, StudentReward, EnrolledCourse, RewardsStats } from "./types"
import { getCurrentPeriod } from "@/lib/period"

export function calculateTotalPoints(pointsBySource: Array<{ _sum: { amount: number | null } }>): number {
  return pointsBySource.reduce((acc, p) => acc + (p._sum.amount || 0), 0)
}

export function canAfford(totalPoints: number, rewardCost: number): boolean {
  return totalPoints >= rewardCost
}

export function canUse(reward: Reward, usesCount: number): boolean {
  return reward.maxUses === null || usesCount < reward.maxUses
}

export function getUsesCount(studentRewards: StudentReward[], rewardId: string): number {
  return studentRewards.filter((sr) => sr.rewardId === rewardId && sr.status !== "RECHAZADO").length
}

export function hasPendingRequest(studentRewards: StudentReward[], rewardId: string, courseId: string): boolean {
  return studentRewards.some((sr) => sr.rewardId === rewardId && sr.courseId === courseId && sr.status === "SOLICITADO")
}

export function buildRewardWithEligibility(
  reward: Reward,
  studentRewards: StudentReward[],
  totalPoints: number
): Reward & { canAfford: boolean; canUse: boolean; usesCount: number; earned: StudentReward | null } {
  const usesCount = getUsesCount(studentRewards, reward.id)
  const earned = studentRewards.find((sr) => sr.rewardId === reward.id) || null

  return {
    ...reward,
    canAfford: canAfford(totalPoints, reward.cost),
    canUse: canUse(reward, usesCount),
    usesCount,
    earned,
  }
}

export function isEligibleCourse(enrolledCourses: EnrolledCourse[], courseId: string): boolean {
  return enrolledCourses.some((course) => course.id === courseId)
}

export function buildStats(rewardsWithEligibility: ReturnType<typeof buildRewardWithEligibility>[], studentRewards: StudentReward[]): RewardsStats {
  const byCategory = rewardsWithEligibility.reduce((acc, reward) => {
    if (!acc[reward.category]) {
      acc[reward.category] = { total: 0, available: 0, used: 0 }
    }
    acc[reward.category].total++
    if (reward.canUse && reward.canAfford) acc[reward.category].available++
    if (reward.earned?.status === "APROBADO") acc[reward.category].used++
    return acc
  }, {} as Record<string, { total: number; available: number; used: number }>)

  return {
    totalPoints: 0,
    totalRewards: rewardsWithEligibility.length,
    availableRewards: rewardsWithEligibility.filter((r) => r.canUse && r.canAfford).length,
    usedRewards: studentRewards.filter((sr) => sr.status === "APROBADO").length,
    byCategory,
  }
}

export function validateTeacherAssignment(
  studentEnrollments: Array<{ courseId: string; status: string; semesterCode: string }>,
  assignedCourseIds: string[],
  assignedPeriods: string[],
  courseId?: string
): { isAssigned: boolean; error?: string } {
  const eligibleEnrollments = studentEnrollments.filter((enrollment) =>
    assignedCourseIds.includes(enrollment.courseId) &&
    ["CURSANDO", "INSCRITO"].includes(enrollment.status) &&
    (assignedPeriods.length === 0 || assignedPeriods.includes(enrollment.semesterCode))
  )

  if (courseId && !eligibleEnrollments.some((enrollment) => enrollment.courseId === courseId)) {
    return { isAssigned: false, error: "El estudiante no está matriculado en ese curso asignado" }
  }

  if (eligibleEnrollments.length === 0) {
    return { isAssigned: false, error: "El estudiante no pertenece a tus cursos vigentes" }
  }

  return { isAssigned: true }
}

export { getCurrentPeriod }

export function calculateExpiresAt(days = 30): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}