import { format, subDays, startOfDay, differenceInDays, parseISO } from 'date-fns'

/**
 * Check if user has checked in today
 */
export function hasCheckedInToday(checkInDates: string[]): boolean {
  if (!checkInDates.length) return false
  const today = format(new Date(), 'yyyy-MM-dd')
  return checkInDates.includes(today)
}

/**
 * Generate heatmap data for the last N days
 */
export function generateHeatmapData(checkInDates: string[], days: number = 365) {
  const data: { date: string; count: number; level: number }[] = []
  const checkInSet = new Set(checkInDates)

  for (let i = days - 1; i >= 0; i--) {
    const date = format(subDays(new Date(), i), 'yyyy-MM-dd')
    const count = checkInSet.has(date) ? 1 : 0
    data.push({
      date,
      count,
      level: count > 0 ? 1 : 0,
    })
  }

  return data
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, 'MMM d, yyyy')
}

export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  const diff = differenceInDays(new Date(), d)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return `${diff} days ago`
  if (diff < 30) return `${Math.floor(diff / 7)} weeks ago`
  return formatDate(d)
}

/**
 * Calculate level from XP
 * Each level requires 100 XP, with increasing difficulty
 */
export function calculateLevel(xp: number): { level: number; currentLevelXp: number; nextLevelXp: number; progress: number } {
  // Level formula: XP needed for level n = 100 * n
  let level = 1
  let xpRequired = 100
  let xpAccumulated = 0

  while (xp >= xpAccumulated + xpRequired) {
    xpAccumulated += xpRequired
    level++
    xpRequired = 100 * level
  }

  const currentLevelXp = xp - xpAccumulated
  const nextLevelXp = xpRequired
  const progress = (currentLevelXp / nextLevelXp) * 100

  return { level, currentLevelXp, nextLevelXp, progress }
}

/**
 * Get streak fire intensity based on streak length
 */
export function getStreakFireEmoji(streak: number): string {
  if (streak === 0) return '💨'
  if (streak < 7) return '🔥'
  if (streak < 14) return '🔥🔥'
  if (streak < 30) return '🔥🔥🔥'
  if (streak < 100) return '💥🔥🔥'
  return '🚀🔥💥'
}

/**
 * Calculate current streak from check-in dates.
 * Consecutive days ending on `today` (defaults to the
 * runtime's local date). Returns 0 if most recent
 * check-in is more than 1 day before `today`.
 * Skips same-day duplicates.
 *
 * `today` should be a `yyyy-MM-dd` string. Pass an explicit
 * value to align with a database-computed "today" (e.g.
 * `(now() at time zone profile.timezone)::date`).
 */
export function calculateStreak(
  checkInDates: string[],
  today?: string
): number {
  if (!checkInDates.length) return 0

  const sorted = checkInDates
    .map((d) => startOfDay(parseISO(d)).getTime())
    .sort((a, b) => b - a) // newest first

  const todayMs = today
    ? startOfDay(parseISO(today)).getTime()
    : startOfDay(new Date()).getTime()
  const mostRecent = sorted[0]

  // If most recent check-in is older than yesterday, streak is 0
  const daysSinceLast = Math.floor((todayMs - mostRecent) / (1000 * 60 * 60 * 24))
  if (daysSinceLast > 1) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.floor((sorted[i - 1] - sorted[i]) / (1000 * 60 * 60 * 24))
    if (diff === 1) {
      streak++
    } else if (diff === 0) {
      // Same day, skip
      continue
    } else {
      break
    }
  }

  return streak
}

/**
 * Calculate longest historical streak from check-in dates.
 * Finds the maximum consecutive sequence across all check-in dates.
 * Skips same-day duplicates.
 */
export function calculateLongestStreak(checkInDates: string[]): number {
  if (!checkInDates.length) return 0

  const dates = checkInDates
    .map((d) => startOfDay(parseISO(d)).getTime())
    .sort((a, b) => a - b) // oldest first
    .filter((d, i, arr) => i === 0 || d !== arr[i - 1]) // remove duplicates

  let longest = 1
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const diff = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
    if (diff === 1) {
      current++
      longest = Math.max(longest, current)
    } else if (diff === 0) {
      // Same day, skip (doesn't break or extend streak)
      continue
    } else {
      current = 1 // Reset on gap
    }
  }

  return longest
}

/**
 * Get streak milestone message
 */
export function getStreakMilestone(streak: number): string | null {
  if (streak === 7) return '1 Week Strong! 🎉'
  if (streak === 14) return '2 Weeks! 💪'
  if (streak === 30) return '1 Month! 🏆'
  if (streak === 50) return '50 Days! 🔥'
  if (streak === 100) return '100 Days! Legendary! 🚀'
  if (streak === 365) return '1 Year! 👑'
  return null
}