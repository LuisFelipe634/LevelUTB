export type AccessRecord = {
  createdAt: Date
}

export type MissionCompletionRecord = {
  missionId: string
  completedAt: Date
}

function normalizeUTCDate(date: Date): Date {
  const normalized = new Date(date)
  normalized.setUTCHours(0, 0, 0, 0)
  return normalized
}

function getDateKey(date: Date): string {
  return normalizeUTCDate(date).toISOString().slice(0, 10)
}

export function computeConsecutiveAccessStreak(
  records: AccessRecord[],
  now = new Date()
): number {
  const accessDates = new Set(
    records.map(({ createdAt }) => getDateKey(createdAt))
  )

  if (accessDates.size === 0) {
    return 0
  }

  let streak = 0
  const cursor = normalizeUTCDate(now)

  for (let index = 0; index < 30; index++) {
    if (!accessDates.has(getDateKey(cursor))) {
      break
    }

    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}

export function countUniqueCompletedMissions(
  records: MissionCompletionRecord[],
  now = new Date(),
  windowDays = 7
): number {
  const minDate = normalizeUTCDate(now)
  minDate.setUTCDate(minDate.getUTCDate() - (windowDays - 1))

  const uniqueMissionIds = new Set(
    records
      .filter(({ completedAt }) => completedAt >= minDate)
      .map(({ missionId }) => missionId)
  )

  return uniqueMissionIds.size
}