export function getCurrentPeriod(date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth() < 6 ? 1 : 2}`
}

export function getSemesterFromPeriod(period: string): number {
  const parts = period.split("-")
  return parts.length === 2 ? Number(parts[1]) : 1
}

export function getYearFromPeriod(period: string): number {
  const parts = period.split("-")
  return parts.length === 2 ? Number(parts[0]) : new Date().getFullYear()
}

export function parsePeriod(period: string): { year: number; semester: number } | null {
  const parts = period.split("-")
  if (parts.length !== 2) return null
  const year = Number(parts[0])
  const semester = Number(parts[1])
  if (!Number.isFinite(year) || !Number.isFinite(semester)) return null
  if (semester !== 1 && semester !== 2) return null
  return { year, semester }
}

export function isCurrentPeriod(period: string, date = new Date()): boolean {
  return period === getCurrentPeriod(date)
}

export function getNextPeriod(period: string): string {
  const parsed = parsePeriod(period)
  if (!parsed) return getCurrentPeriod()
  const { year, semester } = parsed
  if (semester === 1) return `${year}-2`
  return `${year + 1}-1`
}

export function getPreviousPeriod(period: string): string {
  const parsed = parsePeriod(period)
  if (!parsed) return getCurrentPeriod()
  const { year, semester } = parsed
  if (semester === 2) return `${year}-1`
  return `${year - 1}-2`
}