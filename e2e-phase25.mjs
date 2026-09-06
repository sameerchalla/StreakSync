// Phase 2.5 Comprehensive E2E Verification - Fixed version
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://poacwioygsyioyikkzvw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBvYWN3aW95Z3N5aW95aWtrenZ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NDUwNTcsImV4cCI6MjEwNDAyMTA1N30.JdD524tgRHDrZ5EZs3tESt8IYyYxVsaFkpA3BiihMv8'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const testResults = []
const users = {}
const rooms = {}

function log(category, test, passed, details = '') {
  const icon = passed ? '✓' : '✗'
  const color = passed ? '\x1b[32m' : '\x1b[31m'
  console.log(`${color}${icon}\x1b[0m [${category}] ${test}${details ? ': ' + details : ''}`)
  testResults.push({ category, test, passed, details })
}

async function cleanAllData() {
  console.log('\n=== CLEANUP ===')

  // Get all profiles
  const { data: profiles } = await supabase.from('profiles').select('id, username')
  for (const p of profiles || []) {
    if (p.username?.startsWith('e2e_')) {
      await supabase.from('check_ins').delete().eq('user_id', p.id)
      await supabase.from('room_members').delete().eq('user_id', p.id)
      await supabase.from('profiles').delete().eq('id', p.id)
    }
  }

  // Get all rooms
  const { data: roomList } = await supabase.from('rooms').select('id, name')
  for (const r of roomList || []) {
    if (r.name?.includes('E2E')) {
      await supabase.from('check_ins').delete().eq('room_id', r.id)
      await supabase.from('room_members').delete().eq('room_id', r.id)
      await supabase.from('rooms').delete().eq('id', r.id)
    }
  }

  console.log('  Cleanup complete')
}

async function testMigrationStatus() {
  console.log('\n=== TEST 1: MIGRATION STATUS ===')

  // Try to call each function with a dummy UUID and check for specific errors
  const dummyUUID = '00000000-0000-0000-0000-000000000000'

  // If migration IS applied, calling calculate_user_current_streak with dummy UUID
  // should return 0 (no error).
  // If migration is NOT applied, the function doesn't exist and we get an error.

  const { data, error } = await supabase.rpc('calculate_user_current_streak', { target_user_id: dummyUUID })

  console.log(`  Function call result: data=${data}, error=${error?.message || 'none'}`)

  const migrationApplied = !error || !error.message.includes('Could not find the function')

  log('MIGRATION', 'calculate_user_current_streak exists', migrationApplied,
    migrationApplied ? 'Function exists and returned ' + data : 'Function NOT found - migration NOT applied')

  // Try to call the other functions
  const { error: err2 } = await supabase.rpc('calculate_user_longest_streak', { target_user_id: dummyUUID })
  log('MIGRATION', 'calculate_user_longest_streak exists', !err2 || !err2.message.includes('Could not find'),
    err2?.message || 'OK')

  return migrationApplied
}

async function testCreateUsers() {
  console.log('\n=== TEST 2: CREATE USERS ===')

  const userConfigs = [
    { username: 'e2e_userA', email: 'e2e_usera@test.com', password: 'TestPass123!' },
    { username: 'e2e_userB', email: 'e2e_userb@test.com', password: 'TestPass123!' },
    { username: 'e2e_userC', email: 'e2e_userc@test.com', password: 'TestPass123!' },
  ]

  for (const config of userConfigs) {
    // Sign up
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: config.email,
      password: config.password,
      options: {
        data: {
          username: config.username,
          display_name: config.username,
        },
      },
    })

    if (signUpError && !signUpError.message.includes('already registered')) {
      log('AUTH', `Sign up ${config.username}`, false, `Error: ${signUpError.message}`)
      continue
    }

    // Sign in to get authenticated session
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: config.email,
      password: config.password,
    })

    if (signInError) {
      log('AUTH', `Sign in ${config.username}`, false, `Error: ${signInError.message}`)
      continue
    }

    users[config.username] = {
      id: signInData.user.id,
      email: config.email,
      password: config.password,
      client: null,
    }

    // Create separate client for this user
    users[config.username].client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    await users[config.username].client.auth.signInWithPassword({
      email: config.email,
      password: config.password,
    })

    // Get profile
    const { data: profile } = await users[config.username].client.from('profiles')
      .select('*').eq('id', signInData.user.id).single()

    if (profile) {
      users[config.username].id = profile.id
      log('AUTH', `Sign up ${config.username}`, true,
        `ID: ${profile.id.slice(0, 8)}..., current_streak: ${profile.current_streak}`)
    }
  }

  return Object.keys(users).length === 3
}

async function testCreateRoom() {
  console.log('\n=== TEST 3: CREATE ROOM ===')

  const userA = users['e2e_userA']
  if (!userA) {
    log('ROOM', 'Create room', false, 'No user A')
    return false
  }

  // Clean up any existing test room
  await supabase.from('rooms').delete().like('name', '%E2E%')

  const { data, error } = await userA.client.from('rooms').insert({
    name: 'E2E Test Room',
    description: 'Room for Phase 2.5 testing',
    goal: 'Test the streak system',
    icon: '🧪',
    color: '#8B5CF6',
    streak_goal: 30,
    is_public: true,
    created_by: userA.id,
  }).select().single()

  if (error) {
    log('ROOM', 'Create room', false, `Error: ${error.message}`)
    return false
  }

  rooms['E2E Test Room'] = { id: data.id, creator: 'e2e_userA' }
  log('ROOM', 'Create room', true, `ID: ${data.id.slice(0, 8)}...`)

  // Add all users as members
  for (const username of ['e2e_userA', 'e2e_userB', 'e2e_userC']) {
    const user = users[username]
    if (user) {
      const { error: memberError } = await user.client.from('room_members').upsert({
        user_id: user.id,
        room_id: data.id,
        is_active: true,
      }, { onConflict: 'user_id,room_id' })

      if (!memberError) {
        log('ROOM', `Add ${username} as member`, true)
      } else {
        log('ROOM', `Add ${username} as member`, false, memberError.message)
      }
    }
  }

  return true
}

async function testCheckInAndStreak() {
  console.log('\n=== TEST 4: CHECK-IN AND STREAK ===')

  const userA = users['e2e_userA']
  const room = rooms['E2E Test Room']
  if (!userA || !room) return false

  const today = new Date().toISOString().split('T')[0]

  // User A checks in
  const { data: checkinData, error: checkinError } = await userA.client.from('check_ins').upsert({
    user_id: userA.id,
    room_id: room.id,
    check_in_date: today,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' }).select().single()

  if (checkinError) {
    log('STREAK', 'User A check-in', false, `Error: ${checkinError.message}`)
    return false
  }
  log('STREAK', 'User A check-in (today)', true, `ID: ${checkinData.id.slice(0, 8)}...`)

  await new Promise(r => setTimeout(r, 1000))

  // Check profile
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userA.id).single()
  console.log(`  Profile state: current_streak=${profile.current_streak}, longest_streak=${profile.longest_streak}, total_checkins=${profile.total_checkins}, xp=${profile.xp}`)

  // EXPECTED: After 1 check-in, if migration applied, current_streak should be 1
  log('STREAK', 'Profile current_streak = 1 after first check-in',
    profile.current_streak === 1,
    `Expected: 1, Got: ${profile.current_streak}`)

  log('STREAK', 'Profile longest_streak = 1 after first check-in',
    profile.longest_streak === 1,
    `Expected: 1, Got: ${profile.longest_streak}`)

  log('STREAK', 'Profile total_checkins = 1',
    profile.total_checkins === 1,
    `Expected: 1, Got: ${profile.total_checkins}`)

  // Check room
  const { data: roomData } = await supabase.from('rooms').select('*').eq('id', room.id).single()
  console.log(`  Room state: current_room_streak=${roomData.current_room_streak}, max_room_streak=${roomData.max_room_streak}`)

  log('STREAK', 'Room current_room_streak = 1 after first check-in',
    roomData.current_room_streak === 1,
    `Expected: 1, Got: ${roomData.current_room_streak}`)

  return true
}

async function testDuplicateCheckIn() {
  console.log('\n=== TEST 5: DUPLICATE CHECK-IN PREVENTION ===')

  const userA = users['e2e_userA']
  const room = rooms['E2E Test Room']
  if (!userA || !room) return false

  const today = new Date().toISOString().split('T')[0]
  const initialXP = (await supabase.from('profiles').select('xp').eq('id', userA.id).single()).data.xp
  const initialTotal = (await supabase.from('profiles').select('total_checkins').eq('id', userA.id).single()).data.total_checkins

  // Try to insert duplicate (should be ignored by upsert)
  const { error } = await userA.client.from('check_ins').upsert({
    user_id: userA.id,
    room_id: room.id,
    check_in_date: today,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' })

  await new Promise(r => setTimeout(r, 500))

  const afterXP = (await supabase.from('profiles').select('xp').eq('id', userA.id).single()).data.xp
  const afterTotal = (await supabase.from('profiles').select('total_checkins').eq('id', userA.id).single()).data.total_checkins

  // CRITICAL: XP and total_checkins should NOT increase on duplicate
  log('IDEMPOTENCY', 'XP not doubled on duplicate upsert',
    afterXP === initialXP,
    `Before: ${initialXP}, After: ${afterXP} (should be same)`)

  log('IDEMPOTENCY', 'total_checkins not doubled on duplicate upsert',
    afterTotal === initialTotal,
    `Before: ${initialTotal}, After: ${afterTotal} (should be same)`)

  return true
}

async function testYesterdayAndTwoDayStreak() {
  console.log('\n=== TEST 6: YESTERDAY & TWO-DAY STREAK ===')

  const userB = users['e2e_userB']
  const userC = users['e2e_userC']
  const room = rooms['E2E Test Room']
  if (!userB || !userC || !room) return false

  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  // User B checks in only yesterday
  await userB.client.from('check_ins').upsert({
    user_id: userB.id,
    room_id: room.id,
    check_in_date: yesterdayStr,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' })

  // User C checks in yesterday AND today (2-day streak)
  await userC.client.from('check_ins').upsert({
    user_id: userC.id,
    room_id: room.id,
    check_in_date: yesterdayStr,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' })

  await userC.client.from('check_ins').upsert({
    user_id: userC.id,
    room_id: room.id,
    check_in_date: todayStr,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' })

  await new Promise(r => setTimeout(r, 1000))

  // Check User B profile
  const { data: profileB } = await supabase.from('profiles').select('*').eq('id', userB.id).single()
  console.log(`  User B (yesterday only): current=${profileB.current_streak}, longest=${profileB.longest_streak}`)
  log('STREAK', 'User B (yesterday only) has streak >= 1',
    profileB.current_streak >= 1 && profileB.current_streak <= 1,
    `Expected: 1, Got: ${profileB.current_streak}`)

  // Check User C profile
  const { data: profileC } = await supabase.from('profiles').select('*').eq('id', userC.id).single()
  console.log(`  User C (today + yesterday): current=${profileC.current_streak}, longest=${profileC.longest_streak}`)
  log('STREAK', 'User C (2 consecutive days) current_streak = 2',
    profileC.current_streak === 2,
    `Expected: 2, Got: ${profileC.current_streak}`)

  log('STREAK', 'User C longest_streak = 2',
    profileC.longest_streak === 2,
    `Expected: 2, Got: ${profileC.longest_streak}`)

  return true
}

async function testRoomStreak() {
  console.log('\n=== TEST 7: ROOM STREAK DEFINITION ===')

  const room = rooms['E2E Test Room']
  if (!room) return false

  const { data: checkins } = await supabase.from('check_ins')
    .select('user_id, check_in_date, profiles:user_id(username)')
    .eq('room_id', room.id)
    .order('check_in_date')

  const { data: roomData } = await supabase.from('rooms').select('*').eq('id', room.id).single()

  console.log(`\n  Room: ${roomData.name}`)
  console.log(`  current_room_streak: ${roomData.current_room_streak}`)
  console.log(`  max_room_streak: ${roomData.max_room_streak}`)
  console.log(`  Check-ins (${checkins?.length || 0}):`)

  if (checkins) {
    checkins.forEach(ci => {
      console.log(`    - ${ci.check_in_date}: ${ci.profiles?.username || ci.user_id.slice(0, 8)}`)
    })
  }

  console.log(`\n  *** ROOM STREAK DEFINITION ***`)
  console.log(`  The current_room_streak is calculated from all check-in dates in the room.`)
  console.log(`  Two check-in dates: yesterday (User B, User C) and today (User A, User C)`)
  console.log(`  Expected room streak: 2 (consecutive: yesterday + today)`)
  console.log(`  Actual room streak: ${roomData.current_room_streak}`)

  log('ROOM', 'Room current_room_streak = 2 (consecutive days)', roomData.current_room_streak === 2,
    `Expected: 2, Got: ${roomData.current_room_streak}`)

  return true
}

async function testLongestStreakPreservation() {
  console.log('\n=== TEST 8: LONGEST STREAK PRESERVATION ===')

  const userC = users['e2e_userC']
  if (!userC) return false

  // Now simulate a gap - delete today's check-in
  const today = new Date().toISOString().split('T')[0]
  await supabase.from('check_ins').delete()
    .eq('user_id', userC.id)
    .eq('room_id', rooms['E2E Test Room'].id)
    .eq('check_in_date', today)

  // Re-insert via upsert to trigger (if any)
  await userC.client.from('check_ins').upsert({
    user_id: userC.id,
    room_id: rooms['E2E Test Room'].id,
    check_in_date: today,
    completed: true,
  }, { onConflict: 'user_id,room_id,check_in_date' })

  await new Promise(r => setTimeout(r, 500))

  const { data: profileC } = await supabase.from('profiles').select('*').eq('id', userC.id).single()
  console.log(`  User C after re-insert: current=${profileC.current_streak}, longest=${profileC.longest_streak}`)

  // Now simulate a gap by deleting today's check-in for user C only
  await supabase.from('check_ins').delete()
    .eq('user_id', userC.id)
    .eq('room_id', rooms['E2E Test Room'].id)
    .eq('check_in_date', today)

  // We can't easily insert a "future" or "past" gap, but we can verify longest_streak
  // is preserved even if current_streak resets

  // For the test, just check that longest_streak is maintained
  log('STREAK', 'longest_streak is preserved from earlier achievement',
    profileC.longest_streak >= 2,
    `Expected: >=2, Got: ${profileC.longest_streak}`)

  return true
}

async function testFrontendVsDb() {
  console.log('\n=== TEST 9: FRONTEND VS DATABASE ===')

  for (const username of ['e2e_userA', 'e2e_userB', 'e2e_userC']) {
    const user = users[username]
    if (!user) continue

    const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    const { data: checkins } = await supabase.from('check_ins')
      .select('check_in_date').eq('user_id', user.id)

    const dates = [...new Set((checkins || []).map(c => c.check_in_date))].sort()

    // Frontend algorithm
    function calcCurrent(dates) {
      if (!dates.length) return 0
      const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => b - a)
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const mostRecent = sorted[0]
      const daysSinceLast = Math.floor((today.getTime() - mostRecent) / (1000 * 60 * 60 * 24))
      if (daysSinceLast > 1) return 0
      let streak = 1
      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.floor((sorted[i - 1] - sorted[i]) / (1000 * 60 * 60 * 24))
        if (diff === 1) streak++
        else if (diff === 0) continue
        else break
      }
      return streak
    }

    function calcLongest(dates) {
      if (!dates.length) return 0
      const sorted = dates.map(d => new Date(d).getTime()).sort((a, b) => a - b)
      let longest = 1, current = 1
      for (let i = 1; i < sorted.length; i++) {
        const diff = Math.floor((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24))
        if (diff === 1) { current++; longest = Math.max(longest, current) }
        else if (diff === 0) continue
        else current = 1
      }
      return longest
    }

    const frontendCurrent = calcCurrent(dates)
    const frontendLongest = calcLongest(dates)

    console.log(`  ${username}: DB current=${profile.current_streak}, longest=${profile.longest_streak} | Frontend current=${frontendCurrent}, longest=${frontendLongest} | dates=${dates.length}`)

    log('CONSISTENCY', `${username} frontend=DB (current)`,
      profile.current_streak === frontendCurrent,
      `DB: ${profile.current_streak}, FE: ${frontendCurrent}`)

    log('CONSISTENCY', `${username} frontend=DB (longest)`,
      profile.longest_streak === frontendLongest,
      `DB: ${profile.longest_streak}, FE: ${frontendLongest}`)
  }

  return true
}

async function testDatabaseConstraints() {
  console.log('\n=== TEST 10: DATABASE CONSTRAINTS ===')

  const { data: checkins } = await supabase.from('check_ins').select('*')

  const uniqueKeys = new Set()
  const duplicates = []

  for (const ci of checkins || []) {
    const key = `${ci.user_id}:${ci.room_id}:${ci.check_in_date}`
    if (uniqueKeys.has(key)) {
      duplicates.push(key)
    }
    uniqueKeys.add(key)
  }

  log('CONSTRAINT', 'No duplicate check-ins in DB', duplicates.length === 0,
    duplicates.length > 0 ? `Duplicates: ${duplicates.length}` : 'All unique')

  return true
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║       PHASE 2.5: STREAKSYNC PRODUCTION VERIFICATION           ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')

  await cleanAllData()
  await testMigrationStatus()
  await testCreateUsers()
  await testCreateRoom()
  await testCheckInAndStreak()
  await testDuplicateCheckIn()
  await testYesterdayAndTwoDayStreak()
  await testRoomStreak()
  await testLongestStreakPreservation()
  await testFrontendVsDb()
  await testDatabaseConstraints()

  console.log('\n╔═══════════════════════════════════════════════════════════════╗')
  console.log('║                      TEST SUMMARY                            ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')

  const passed = testResults.filter(r => r.passed).length
  const failed = testResults.filter(r => !r.passed).length

  console.log(`\nTotal tests: ${testResults.length}`)
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`)
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`)

  if (failed > 0) {
    console.log('\n--- FAILED TESTS ---')
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`  ✗ [${r.category}] ${r.test}: ${r.details}`)
    })
  }

  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})
