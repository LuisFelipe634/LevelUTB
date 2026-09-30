export type AccessRecord = { createdAt: Date }

export type MissionCompletionRecord = {
  missionId: string
  completedAt: Date
}

export function computeConsecutiveAccessStreak(records: AccessRecord[], now = new Date()): number {
  const normalized = new Set(
    records.map((record) => {
      const date = new Date(record.createdAt)
      date.setUTCHours(0, 0, 0, 0)
      return date.toISOString().slice(0, 10)
    })
  )

  if (normalized.size === 0) {
    return 0
  }

  let streak = 0
  const cursor = new Date(now)
  cursor.setUTCHours(0, 0, 0, 0)

  for (let index = 0; index < 30; index++) {
    const dateKey = cursor.toISOString().slice(0, 10)
    if (!normalized.has(dateKey)) {
      break
    }

    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  return streak
}

export function countUniqueCompletedMissions(
  records: MissionCompletionRecord[],
  now = new Date(),
  windowDays = 7
): number {
  const minDate = new Date(now)
  minDate.setUTCDate(minDate.getUTCDate() - (windowDays - 1))
  minDate.setUTCHours(0, 0, 0, 0)

  const uniqueMissionIds = new Set<string>()

  for (const record of records) {
    if (record.completedAt < minDate) continue
    uniqueMissionIds.add(record.missionId)
  }

  return uniqueMissionIds.size
}