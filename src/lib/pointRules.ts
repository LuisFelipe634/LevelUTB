export const DEFAULT_BASE_POINTS = 100
export const DEFAULT_POINTS_PER_CREDIT = 20
export const DEFAULT_ACADEMIC_POINTS_CAP = 300
export const DEFAULT_WEEKLY_MISSION_CAP = 300
export const DEFAULT_PERIOD_MISSION_CAP = 5000

export function calculateAcademicPoints(
  approvedCredits: number,
  pointsPerCredit = DEFAULT_POINTS_PER_CREDIT,
  cap = DEFAULT_ACADEMIC_POINTS_CAP,
): number {
  if (!Number.isFinite(approvedCredits) || approvedCredits < 0) return 0
  if (!Number.isFinite(pointsPerCredit) || pointsPerCredit < 0) return 0
  if (!Number.isFinite(cap) || cap < 0) return 0
  return Math.min(Math.floor(approvedCredits) * Math.floor(pointsPerCredit), Math.floor(cap))
}

export function calculateInitialPeriodPoints(
  approvedCredits: number,
  basePoints = DEFAULT_BASE_POINTS,
  pointsPerCredit = DEFAULT_POINTS_PER_CREDIT,
  academicCap = DEFAULT_ACADEMIC_POINTS_CAP,
): number {
  const safeBasePoints = Number.isFinite(basePoints) && basePoints > 0 ? Math.floor(basePoints) : 0
  return safeBasePoints + calculateAcademicPoints(approvedCredits, pointsPerCredit, academicCap)
}

export function calculatePointBalance(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + (Number.isFinite(amount) ? amount : 0), 0)
}

export function buildPointReference(parts: string[]): string {
  return parts.map((part) => part.trim()).join(":")
}

export function canAwardMissionPoints(
  amount: number,
  earnedThisWeek: number,
  earnedThisPeriod: number,
  weeklyCap = DEFAULT_WEEKLY_MISSION_CAP,
  periodCap = DEFAULT_PERIOD_MISSION_CAP,
): boolean {
  if (!Number.isFinite(amount) || amount <= 0) return false
  if (earnedThisWeek < 0 || earnedThisPeriod < 0) return false
  return earnedThisWeek + amount <= weeklyCap && earnedThisPeriod + amount <= periodCap
}
