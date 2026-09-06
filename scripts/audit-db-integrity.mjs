/**
 * StreakSync Database Integrity Audit Script
 *
 * Production-safe audit script that verifies critical database invariants:
 * 1. XP Invariant: xp === total_checkins * 10
 * 2. Streak Invariant: current_streak >= 0, longest_streak >= 0, longest >= current
 * 3. Room Quorum Invariant: streak_min_members >= 1
 *
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed (anomalies detected)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load .env.local if it exists (simple parser, no external dependency)
try {
  const envFile = readFileSync('.env.local', 'utf-8')
  for (const line of envFile.split('\n')) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim()
      }
    }
  }
} catch {
  // .env.local not found, rely on shell environment variables
}

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_ANON_KEY environment variables are required.')
  console.error('Set them in .env.local or as environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Track anomalies for final exit code
const anomalies = []

function printHeader(title) {
  console.log('\n' + '═'.repeat(64))
  console.log(`  ${title}`)
  console.log('═'.repeat(64))
}

function printCheck(name, passed, detail = '') {
  const icon = passed ? '✅' : '❌'
  const status = passed ? 'PASS' : 'FAIL'
  console.log(`  ${icon} ${name}: [${status}]${detail ? ' ' + detail : ''}`)
}

function printAnomaly(type, detail) {
  console.log(`     └─ ${type}: ${detail}`)
  anomalies.push({ type, detail })
}

async function auditXPInvariant() {
  printHeader('AUDIT 1: XP Invariant (xp = total_checkins × 10)')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, xp, total_checkins')

  if (error) {
    printCheck('XP Query', false, error.message)
    return false
  }

  if (!profiles || profiles.length === 0) {
    printCheck('XP Invariant', true, 'No profiles found (empty table)')
    return true
  }

  let allPassed = true
  let checkedCount = 0
  let xpMismatchCount = 0
  let checkinMismatchCount = 0

  for (const p of profiles) {
    checkedCount++
    const expectedXp = (p.total_checkins || 0) * 10

    // Check XP invariant
    if (p.xp !== expectedXp) {
      xpMismatchCount++
      if (xpMismatchCount <= 5) { // Only show first 5
        printAnomaly(`Profile ${p.id.slice(0, 8)}`, `xp=${p.xp}, expected=${expectedXp} (${p.total_checkins} × 10)`)
      }
      allPassed = false
    }
  }

  // Verify total_checkins matches actual check-in count (sample check)
  const { data: checkinCounts, error: ciError } = await supabase
    .from('check_ins')
    .select('user_id')

  if (ciError) {
    printCheck('Check-in Count Query', false, ciError.message)
  } else {
    // Aggregate check-ins per user
    const actualCounts = {}
    for (const ci of checkinCounts || []) {
      actualCounts[ci.user_id] = (actualCounts[ci.user_id] || 0) + 1
    }

    // Compare with profile.total_checkins for a sample
    let sampleChecked = 0
    for (const p of profiles) {
      if (sampleChecked >= 10) break
      const actualCount = actualCounts[p.id] || 0
      if (p.total_checkins !== actualCount) {
        checkinMismatchCount++
        if (checkinMismatchCount <= 3) {
          printAnomaly(`Profile ${p.id.slice(0, 8)}`, `total_checkins=${p.total_checkins}, actual check_ins=${actualCount}`)
        }
        allPassed = false
      }
      sampleChecked++
    }
  }

  if (xpMismatchCount > 5) {
    printAnomaly('Summary', `${xpMismatchCount - 5} more XP mismatches not shown`)
  }
  if (checkinMismatchCount > 3) {
    printAnomaly('Summary', `${checkinMismatchCount - 3} more check-in count mismatches not shown`)
  }

  printCheck('XP Invariant', allPassed, `${checkedCount} profiles checked, ${xpMismatchCount} XP mismatches, ${checkinMismatchCount} checkin count mismatches`)
  return allPassed
}

async function auditStreakInvariant() {
  printHeader('AUDIT 2: Streak Invariant (non-negative & longest >= current)')

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, current_streak, longest_streak')

  if (error) {
    printCheck('Streak Query', false, error.message)
    return false
  }

  if (!profiles || profiles.length === 0) {
    printCheck('Streak Invariant', true, 'No profiles found (empty table)')
    return true
  }

  let allPassed = true
  let checkedCount = 0
  let negativeCurrentCount = 0
  let negativeLongestCount = 0
  let longestLessThanCurrentCount = 0

  for (const p of profiles) {
    checkedCount++

    // Check non-negative constraints
    if ((p.current_streak || 0) < 0) {
      negativeCurrentCount++
      if (negativeCurrentCount <= 3) {
        printAnomaly(`Profile ${p.id.slice(0, 8)}`, `current_streak=${p.current_streak} (negative!)`)
      }
      allPassed = false
    }

    if ((p.longest_streak || 0) < 0) {
      negativeLongestCount++
      if (negativeLongestCount <= 3) {
        printAnomaly(`Profile ${p.id.slice(0, 8)}`, `longest_streak=${p.longest_streak} (negative!)`)
      }
      allPassed = false
    }

    // Check longest_streak >= current_streak
    if ((p.longest_streak || 0) < (p.current_streak || 0)) {
      longestLessThanCurrentCount++
      if (longestLessThanCurrentCount <= 3) {
        printAnomaly(`Profile ${p.id.slice(0, 8)}`, `longest_streak=${p.longest_streak} < current_streak=${p.current_streak}`)
      }
      allPassed = false
    }
  }

  if (negativeCurrentCount > 3) {
    printAnomaly('Summary', `${negativeCurrentCount - 3} more negative current_streak values not shown`)
  }
  if (negativeLongestCount > 3) {
    printAnomaly('Summary', `${negativeLongestCount - 3} more negative longest_streak values not shown`)
  }
  if (longestLessThanCurrentCount > 3) {
    printAnomaly('Summary', `${longestLessThanCurrentCount - 3} more longest < current violations not shown`)
  }

  printCheck('Streak Invariant', allPassed,
    `${checkedCount} profiles checked, ${negativeCurrentCount} negative current, ${negativeLongestCount} negative longest, ${longestLessThanCurrentCount} longest < current`)
  return allPassed
}

async function auditRoomQuorumInvariant() {
  printHeader('AUDIT 3: Room Quorum Invariant (streak_min_members >= 1)')

  const { data: rooms, error } = await supabase
    .from('rooms')
    .select('id, name, streak_min_members')

  if (error) {
    printCheck('Room Query', false, error.message)
    return false
  }

  if (!rooms || rooms.length === 0) {
    printCheck('Room Quorum Invariant', true, 'No rooms found (empty table)')
    return true
  }

  let allPassed = true
  let checkedCount = 0
  let invalidQuorumCount = 0

  // Distribution tracking
  const quorumDistribution = {}

  for (const r of rooms) {
    checkedCount++
    const quorum = r.streak_min_members

    // Track distribution
    quorumDistribution[quorum] = (quorumDistribution[quorum] || 0) + 1

    // Check invariant
    if ((quorum || 0) < 1) {
      invalidQuorumCount++
      if (invalidQuorumCount <= 3) {
        printAnomaly(`Room "${r.name}"`, `streak_min_members=${quorum} (must be >= 1)`)
      }
      allPassed = false
    }
  }

  if (invalidQuorumCount > 3) {
    printAnomaly('Summary', `${invalidQuorumCount - 3} more invalid quorum values not shown`)
  }

  // Print distribution table
  console.log('\n  Quorum Distribution (all rooms):')
  console.log('  ┌─────────────────────────────┐')
  console.log('  │ streak_min_members │ Count │')
  console.log('  ├─────────────────────────────┤')
  for (const [quorum, count] of Object.entries(quorumDistribution).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    console.log(`  │ ${String(quorum).padEnd(19)} │ ${String(count).padEnd(5)} │`)
  }
  console.log('  └─────────────────────────────┘')
  console.log(`  Total rooms: ${checkedCount}`)

  printCheck('Room Quorum Invariant', allPassed, `${checkedCount} rooms checked, ${invalidQuorumCount} invalid quorum values`)
  return allPassed
}

async function runAudit() {
  console.log('\n' + '╔' + '═'.repeat(62) + '╗')
  console.log('║' + ' StreakSync Database Integrity Audit '.padStart(45).padEnd(63) + '║')
  console.log('╚' + '═'.repeat(62) + '╝')
  console.log(`  Timestamp: ${new Date().toISOString()}`)
  console.log(`  Target: ${SUPABASE_URL}`)

  const results = []

  try {
    results.push({ name: 'XP Invariant', passed: await auditXPInvariant() })
    results.push({ name: 'Streak Invariant', passed: await auditStreakInvariant() })
    results.push({ name: 'Room Quorum Invariant', passed: await auditRoomQuorumInvariant() })
  } catch (e) {
    console.error('\n  ❌ FATAL ERROR:', e.message)
    process.exit(1)
  }

  // Final summary
  printHeader('AUDIT SUMMARY')

  const passedCount = results.filter(r => r.passed).length
  const failedCount = results.filter(r => !r.passed).length

  for (const r of results) {
    printCheck(r.name, r.passed)
  }

  console.log('\n' + '─'.repeat(64))
  console.log(`  Results: ${passedCount} passed, ${failedCount} failed`)
  console.log('─'.repeat(64))

  if (anomalies.length > 0) {
    printHeader('ANOMALIES DETECTED')
    const grouped = {}
    for (const a of anomalies) {
      if (!grouped[a.type]) grouped[a.type] = []
      grouped[a.type].push(a.detail)
    }
    // Show unique anomaly types
    const uniqueTypes = [...new Set(anomalies.map(a => a.type))]
    for (const type of uniqueTypes) {
      console.log(`\n  ${type}:`)
      const samples = [...new Set(grouped[type])].slice(0, 5)
      for (const detail of samples) {
        console.log(`     └─ ${detail}`)
      }
      if ([...new Set(grouped[type])].length > 5) {
        console.log(`     └─ ... and ${[...new Set(grouped[type])].length - 5} more unique values`)
      }
    }
  }

  console.log('\n' + '═'.repeat(64))
  if (failedCount === 0) {
    console.log('  🎉 ALL CHECKS PASSED - Database integrity verified')
  } else {
    console.log(`  ❌ ${failedCount} CHECK(S) FAILED - Review anomalies above`)
  }
  console.log('═'.repeat(64) + '\n')

  process.exit(failedCount > 0 ? 1 : 0)
}

runAudit()
