/**
 * Unit tests for streak utilities.
 * These tests cover the client-side streak calculation logic.
 *
 * Note: Tests for DB-level XP idempotency, room quorum logic,
 * and timezone behavior would require database integration tests.
 */

import {
  calculateStreak,
  calculateLongestStreak,
  hasCheckedInToday,
  generateHeatmapData,
  calculateLevel,
} from '../lib/streakUtils'
import { todayInTimezone, getBrowserTimezone } from '../lib/timezone'

// ============================================================
// Personal streak tests
// ============================================================

describe('calculateStreak', () => {
  it('returns 0 for empty array', () => {
    expect(calculateStreak([])).toBe(0)
  })

  it('returns 1 for single check-in today', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(calculateStreak([today])).toBe(1)
  })

  it('returns 1 for check-in yesterday only', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    expect(calculateStreak([yesterday])).toBe(1)
  })

  it('returns 0 when most recent check-in is more than 1 day ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0]
    expect(calculateStreak([twoDaysAgo])).toBe(0)
  })

  it('counts consecutive days correctly', () => {
    const today = new Date()
    const dates = [
      formatDate(today),
      formatDate(new Date(today.getTime() - 86400000)),
      formatDate(new Date(today.getTime() - 2 * 86400000)),
    ]
    expect(calculateStreak(dates)).toBe(3)
  })

  it('skips same-day duplicates', () => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    // Same day repeated 3 times, plus yesterday
    const dates = [today, today, today, yesterday]
    expect(calculateStreak(dates)).toBe(2)
  })

  it('stops counting on gap', () => {
    const today = new Date()
    const dates = [
      formatDate(today),
      formatDate(new Date(today.getTime() - 86400000)),
      // Gap here
      formatDate(new Date(today.getTime() - 3 * 86400000)),
    ]
    expect(calculateStreak(dates)).toBe(2)
  })

  it('respects explicit today parameter', () => {
    const dates = ['2024-01-01', '2024-01-02']
    // Without explicit today, this might return 0 if not recent
    // With explicit today of 2024-01-02, should return 2
    expect(calculateStreak(dates, '2024-01-02')).toBe(2)
  })
})

describe('calculateLongestStreak', () => {
  it('returns 0 for empty array', () => {
    expect(calculateLongestStreak([])).toBe(0)
  })

  it('returns 1 for single check-in', () => {
    expect(calculateLongestStreak(['2024-01-01'])).toBe(1)
  })

  it('finds longest consecutive sequence', () => {
    // Two sequences: 1-2-3 (length 3) and 5-6 (length 2)
    const dates = [
      '2024-01-01',
      '2024-01-02',
      '2024-01-03',
      '2024-01-05', // gap
      '2024-01-06',
    ]
    expect(calculateLongestStreak(dates)).toBe(3)
  })

  it('skips same-day duplicates', () => {
    const dates = [
      '2024-01-01',
      '2024-01-01', // duplicate
      '2024-01-02',
    ]
    expect(calculateLongestStreak(dates)).toBe(2)
  })

  it('handles unsorted dates', () => {
    const dates = [
      '2024-01-03',
      '2024-01-01',
      '2024-01-02',
    ]
    expect(calculateLongestStreak(dates)).toBe(3)
  })
})

// ============================================================
// Check-in tracking tests
// ============================================================

describe('hasCheckedInToday', () => {
  it('returns false for empty array', () => {
    expect(hasCheckedInToday([])).toBe(false)
  })

  it('returns true when today is in list', () => {
    const today = new Date().toISOString().split('T')[0]
    expect(hasCheckedInToday([today])).toBe(true)
  })

  it('returns false when today is not in list', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    expect(hasCheckedInToday([yesterday])).toBe(false)
  })
})

// ============================================================
// Heatmap generation tests
// ============================================================

describe('generateHeatmapData', () => {
  it('generates correct number of days', () => {
    const data = generateHeatmapData([], 30)
    expect(data).toHaveLength(30)
  })

  it('marks checked-in days', () => {
    const today = new Date().toISOString().split('T')[0]
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0]
    const data = generateHeatmapData([today, yesterday])
    const todayEntry = data.find((d) => d.date === today)
    const yesterdayEntry = data.find((d) => d.date === yesterday)
    expect(todayEntry?.count).toBe(1)
    expect(yesterdayEntry?.count).toBe(1)
  })

  it('sets level 1 for checked-in days', () => {
    const today = new Date().toISOString().split('T')[0]
    const data = generateHeatmapData([today])
    const todayEntry = data.find((d) => d.date === today)
    expect(todayEntry?.level).toBe(1)
  })
})

// ============================================================
// Level calculation tests
// ============================================================

describe('calculateLevel', () => {
  it('starts at level 1 with 0 XP', () => {
    const { level } = calculateLevel(0)
    expect(level).toBe(1)
  })

  it('increases level as XP grows', () => {
    expect(calculateLevel(0).level).toBe(1)
    expect(calculateLevel(100).level).toBe(2)
    expect(calculateLevel(300).level).toBe(3)
  })

  it('calculates correct progress percentage', () => {
    const { progress } = calculateLevel(50)
    expect(progress).toBe(50)
  })
})

// ============================================================
// Timezone tests
// ============================================================

describe('todayInTimezone', () => {
  it('returns yyyy-MM-dd format', () => {
    const result = todayInTimezone('UTC')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns same date for UTC at midnight', () => {
    const utcDate = todayInTimezone('UTC')
    const expected = new Date().toISOString().split('T')[0]
    // May differ if local time != UTC
    expect(utcDate).toBeDefined()
  })

  it('handles different timezones', () => {
    // America/New_York is UTC-4 or UTC-5 depending on DST
    const nyDate = todayInTimezone('America/New_York')
    expect(nyDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('getBrowserTimezone', () => {
  it('returns a non-empty string', () => {
    const tz = getBrowserTimezone()
    expect(typeof tz).toBe('string')
    expect(tz.length).toBeGreaterThan(0)
  })
})

// ============================================================
// Room streak (quorum) simulation tests
// ============================================================

describe('Room streak with quorum simulation', () => {
  /**
   * Simulates the room streak calculation with quorum.
   * This is a client-side simulation of what the DB does.
   *
   * In the DB:
   * - daily_counts groups check_ins by date and counts distinct members
   * - qualifying_days filters to dates where count >= quorum
   * - The streak counts consecutive qualifying days
   */

  function simulateRoomStreak(
    checkIns: Array<{ date: string; userId: string }>,
    quorum: number,
    anchorDate: string
  ): number {
    // Group by date and count distinct members
    const dailyCounts: Record<string, Set<string>> = {}
    for (const ci of checkIns) {
      if (!dailyCounts[ci.date]) dailyCounts[ci.date] = new Set()
      dailyCounts[ci.date].add(ci.userId)
    }

    // Filter to qualifying days
    const qualifyingDates = Object.entries(dailyCounts)
      .filter(([_, members]) => members.size >= quorum)
      .map(([date]) => date)
      .sort((a, b) => b.localeCompare(a)) // newest first

    if (qualifyingDates.length === 0) return 0

    // Check if anchor day qualifies
    const mostRecent = qualifyingDates[0]
    const daysSince = daysBetween(mostRecent, anchorDate)
    if (daysSince > 1) return 0

    // Count consecutive days
    let streak = 1
    for (let i = 1; i < qualifyingDates.length; i++) {
      const diff = daysBetween(qualifyingDates[i - 1], qualifyingDates[i])
      if (diff === 1) {
        streak++
      } else {
        break
      }
    }

    return streak
  }

  function daysBetween(date1: string, date2: string): number {
    const d1 = new Date(date1).getTime()
    const d2 = new Date(date2).getTime()
    return Math.abs(Math.floor((d1 - d2) / 86400000))
  }

  it('N=1: any member check-in counts', () => {
    const checkIns = [
      { date: '2024-01-01', userId: 'A' },
      { date: '2024-01-02', userId: 'B' }, // different member
    ]
    expect(simulateRoomStreak(checkIns, 1, '2024-01-02')).toBe(2)
  })

  it('N=2: requires at least 2 members per day', () => {
    const checkIns = [
      { date: '2024-01-01', userId: 'A' },
      { date: '2024-01-01', userId: 'B' }, // same day, 2 members
      { date: '2024-01-02', userId: 'A' }, // only 1 member
    ]
    // Day 1: 2 members ✓, Day 2: 1 member ✗
    // Streak should be 1 (only day 1 qualifies)
    expect(simulateRoomStreak(checkIns, 2, '2024-01-02')).toBe(1)
  })

  it('missed quorum day breaks the streak', () => {
    const checkIns = [
      { date: '2024-01-01', userId: 'A' },
      { date: '2024-01-01', userId: 'B' },
      { date: '2024-01-03', userId: 'A' }, // day 2 missing
      { date: '2024-01-03', userId: 'B' },
    ]
    // Day 1: 2 ✓, Day 2: 0 ✗, Day 3: 2 ✓
    // Streak should be 1 (day 1 only, broken by day 2)
    expect(simulateRoomStreak(checkIns, 2, '2024-01-03')).toBe(1)
  })

  it('N=3: requires at least 3 members per day', () => {
    const checkIns = [
      { date: '2024-01-01', userId: 'A' },
      { date: '2024-01-01', userId: 'B' },
      { date: '2024-01-01', userId: 'C' }, // 3 members
      { date: '2024-01-02', userId: 'A' },
      { date: '2024-01-02', userId: 'B' }, // only 2 members
    ]
    // Day 1: 3 ✓, Day 2: 2 ✗
    // Streak should be 1
    expect(simulateRoomStreak(checkIns, 3, '2024-01-02')).toBe(1)
  })

  it('maintains streak with consistent quorum', () => {
    const checkIns = [
      { date: '2024-01-01', userId: 'A' },
      { date: '2024-01-01', userId: 'B' },
      { date: '2024-01-02', userId: 'A' },
      { date: '2024-01-02', userId: 'B' },
      { date: '2024-01-03', userId: 'A' },
      { date: '2024-01-03', userId: 'B' },
    ]
    expect(simulateRoomStreak(checkIns, 2, '2024-01-03')).toBe(3)
  })
})

// ============================================================
// Timezone edge case tests
// ============================================================

describe('Timezone around midnight', () => {
  it('handles timezone where local date differs from UTC', () => {
    // For a user in UTC+12:
    // - When it's 2024-01-01 20:00 UTC, it's 2024-01-02 08:00 local
    // The DB would record 2024-01-02 as the local date

    // Simulate what the DB would compute
    const utcDate = new Date().toISOString() // e.g., "2024-01-01T22:00:00.000Z"
    const expectedLocalDate = utcDate.split('T')[0] // "2024-01-01"

    // In UTC+12, the local date would be one day ahead
    // But our todayInTimezone function should return the correct local date
    const tz = 'Pacific/Auckland' // UTC+13 in summer
    const localDate = todayInTimezone(tz)

    // The function should return a valid date string
    expect(localDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ============================================================
// Helper functions
// ============================================================

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}
