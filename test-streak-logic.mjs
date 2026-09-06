// Manual test for streak calculation logic
// Run with: node test-streak-logic.mjs

// Replicate the calculateStreak function from streakUtils.ts
function calculateStreak(checkInDates) {
  if (!checkInDates.length) return 0

  const sorted = checkInDates
    .map((d) => startOfDay(new Date(d)).getTime())
    .sort((a, b) => b - a) // newest first

  const today = startOfDay(new Date()).getTime()
  const mostRecent = sorted[0]

  // If most recent check-in is older than yesterday, streak is 0
  const daysSinceLast = Math.floor((today - mostRecent) / (1000 * 60 * 60 * 24))
  if (daysSinceLast > 1) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = Math.floor((sorted[i - 1] - sorted[i]) / (1000 * 60 * 60 * 24))
    if (diff === 1) {
      streak++
    } else if (diff === 0) {
      continue
    } else {
      break
    }
  }

  return streak
}

function calculateLongestStreak(checkInDates) {
  if (!checkInDates.length) return 0

  const dates = checkInDates
    .map((d) => startOfDay(new Date(d)).getTime())
    .sort((a, b) => a - b) // oldest first
    .filter((d, i, arr) => i === 0 || d !== arr[i - 1])

  let longest = 1
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const diff = Math.floor((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24))
    if (diff === 1) {
      current++
      longest = Math.max(longest, current)
    } else if (diff === 0) {
      continue
    } else {
      current = 1
    }
  }

  return longest
}

function startOfDay(d) {
  const date = new Date(d)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatYmd(d) {
  return d.toISOString().split('T')[0]
}

function daysAgo(n) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return formatYmd(d)
}

// ============ TESTS ============

let passed = 0
let failed = 0

function test(name, actual, expected) {
  if (actual === expected) {
    console.log(`✓ ${name}: ${actual}`)
    passed++
  } else {
    console.log(`✗ ${name}: expected ${expected}, got ${actual}`)
    failed++
  }
}

console.log('\n=== calculateStreak Tests ===\n')

// Test 1: Empty array
test('Empty array returns 0', calculateStreak([]), 0)

// Test 2: Single check-in today
test('Single check-in today returns 1', calculateStreak([daysAgo(0)]), 1)

// Test 3: Single check-in yesterday (streak still valid since not > 1 day)
test('Single check-in yesterday returns 1', calculateStreak([daysAgo(1)]), 1)

// Test 4: Single check-in 2 days ago (streak broken)
test('Single check-in 2 days ago returns 0', calculateStreak([daysAgo(2)]), 0)

// Test 5: 2 consecutive days (today + yesterday)
test('2 consecutive days returns 2', calculateStreak([daysAgo(0), daysAgo(1)]), 2)

// Test 6: 3 consecutive days
test('3 consecutive days returns 3', calculateStreak([daysAgo(0), daysAgo(1), daysAgo(2)]), 3)

// Test 7: Missed day in middle
// today, yesterday are consecutive, but day before yesterday (2 days ago) is MISSING
// So current streak should be 2 (today + yesterday)
test('Missed day breaks current: today, yesterday = 2', calculateStreak([daysAgo(0), daysAgo(1), daysAgo(4)]), 2)

// Test 7b: With only today and old date (3 days ago), current = 1 (just today)
test('Only today + old date = 1', calculateStreak([daysAgo(0), daysAgo(4)]), 1)

// Test 8: Duplicate same-day check-ins
test('Duplicate same-day check-ins only count once', calculateStreak([daysAgo(0), daysAgo(0), daysAgo(0)]), 1)

// Test 9: Old streak (5 consecutive + today 1 = 1)
test('Old 5-day streak + 1 today = 1 (gap too long)', calculateStreak([daysAgo(0), daysAgo(7), daysAgo(8), daysAgo(9), daysAgo(10), daysAgo(11)]), 1)

// Test 10: 7 consecutive days
const sevenDays = [0, 1, 2, 3, 4, 5, 6].map(daysAgo)
test('7 consecutive days returns 7', calculateStreak(sevenDays), 7)

console.log('\n=== calculateLongestStreak Tests ===\n')

// Test 1: Empty array
test('Empty array returns 0', calculateLongestStreak([]), 0)

// Test 2: Single date
test('Single date returns 1', calculateLongestStreak([daysAgo(5)]), 1)

// Test 3: 3 consecutive (best=3)
test('3 consecutive days returns 3', calculateLongestStreak([daysAgo(0), daysAgo(1), daysAgo(2)]), 3)

// Test 4: Non-consecutive (Jan 1, Jan 2, Jan 5, Jan 6, Jan 7)
// Best streak should be 3 (Jan 5-7)
test('Non-consecutive: best is 3 (Jan 5-7)', calculateLongestStreak([
  daysAgo(10), daysAgo(9), daysAgo(6), daysAgo(5), daysAgo(4)
]), 3)

// Test 5: 2 separate streaks of 2 and 3, best is 3
test('Two streaks (2 and 3), best is 3', calculateLongestStreak([
  daysAgo(15), daysAgo(14), daysAgo(10), daysAgo(9), daysAgo(8)
]), 3)

// Test 6: All dates non-consecutive, all streaks of 1, best=1
test('All non-consecutive: best is 1', calculateLongestStreak([
  daysAgo(0), daysAgo(3), daysAgo(7), daysAgo(15)
]), 1)

// Test 7: With duplicate same-day
test('Duplicate same-day ignored, streak intact', calculateLongestStreak([
  daysAgo(0), daysAgo(0), daysAgo(1), daysAgo(2)
]), 3)

console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`)

if (failed > 0) {
  process.exit(1)
}
