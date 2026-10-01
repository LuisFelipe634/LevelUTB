type ActivityDate = { createdAt: Date }

export type StreakSummary = {
  current: number
  best: number
  activeToday: boolean
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function calculateStreak(activities: ActivityDate[], now = new Date()): StreakSummary {
  const days = [...new Set(activities.map((activity) => dayKey(activity.createdAt)))].sort((a, b) =>
    b.localeCompare(a)
  )
  const today = dayKey(now)
  const yesterday = dayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const activeToday = days.includes(today)

  let current = 0
  let cursor = activeToday ? today : yesterday
  for (const day of days) {
    if (day !== cursor) break
    current++
    cursor = dayKey(new Date(new Date(`${cursor}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000))
  }

  let best = 0
  let run = 0
  for (let index = 0; index < days.length; index++) {
    const previousDay = index > 0
      ? dayKey(new Date(new Date(`${days[index - 1]}T00:00:00.000Z`).getTime() - 24 * 60 * 60 * 1000))
      : null
    run = index === 0 || previousDay === days[index] ? run + 1 : 1
    best = Math.max(best, run)
  }

  return { current, best, activeToday }
}
