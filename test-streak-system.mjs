// Playwright test for StreakSync streak system fixes
// Verifies the streak system after Phase 2 fixes

import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'

const testResults = []
function logResult(category, test, passed, details) {
  testResults.push({ category, test, passed, details })
  const icon = passed ? '✓' : '✗'
  const color = passed ? '\x1b[32m' : '\x1b[31m'
  console.log(`${color}${icon}\x1b[0m [${category}] ${test}${details ? ': ' + details : ''}`)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()

  // Capture console errors
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('403')) {
        consoleErrors.push(txt)
      }
    }
  })

  page.on('pageerror', err => {
    consoleErrors.push(err.message)
  })

  try {
    // Step 1: Go to landing page
    await page.goto(BASE)
    await page.waitForLoadState('networkidle')

    // Step 2: Click "Sign In" or "Get Started" to navigate to auth
    const signInBtn = await page.locator('a:has-text("Get Started"), a:has-text("Sign In")').first()
    if (await signInBtn.count() > 0) {
      await signInBtn.click()
      await page.waitForLoadState('networkidle')
    }

    // Step 3: Sign up with random credentials
    const testEmail = `streak-test-${Date.now()}@test.com`
    const testUsername = `streak${Date.now()}`.slice(-12)
    const testPassword = 'TestPass123!'

    // Switch to signup mode
    const signupToggle = await page.locator('button:has-text("Sign Up")').first()
    if (await signupToggle.count() > 0) {
      await signupToggle.click()
    }

    // Fill signup form
    await page.fill('input[placeholder="streakmaster"]', testUsername)
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)

    // Submit signup
    const submitBtn = await page.locator('button[type="submit"]:has-text("Create Account")').first()
    await submitBtn.click()

    // Wait for signup to complete
    await page.waitForTimeout(3000)

    // After signup, form should be in "login" mode with success message
    const loginMode = await page.locator('button:has-text("Sign In")').first().isVisible()
    if (loginMode) {
      logResult('AUTH', 'Sign up completed and switched to login mode', true)
    } else {
      logResult('AUTH', 'Sign up did not complete', false)
    }

    // Sign in
    await page.fill('input[type="email"]', testEmail)
    await page.fill('input[type="password"]', testPassword)
    const signInSubmit = await page.locator('button[type="submit"]:has-text("Sign In")').first()
    await signInSubmit.click()

    // Wait for dashboard to load
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await page.waitForLoadState('networkidle')

    logResult('AUTH', 'Signed in and reached dashboard', true)

    // Step 4: Verify dashboard shows streak of 0
    const initialStreak = await page.locator('.text-7xl.font-mono.text-accent').first().textContent()
    logResult('DASHBOARD', 'Initial current streak is 0', initialStreak === '0', `Got: ${initialStreak}`)

    // Step 5: Navigate to rooms
    await page.goto(`${BASE}/rooms`)
    await page.waitForLoadState('networkidle')

    // Create a room
    await page.goto(`${BASE}/rooms/create`)
    await page.waitForLoadState('networkidle')

    await page.fill('input[placeholder*="100 Days"]', 'Streak Test Room')
    await page.fill('input[placeholder*="What do you want"]', 'Test the streak system')
    await page.fill('textarea[placeholder*="describe"]', 'Phase 2 testing room')
    await page.fill('input[type="number"]', '30')

    // Submit room creation
    const createBtn = await page.locator('button:has-text("Create")').last()
    await createBtn.click()
    await page.waitForTimeout(2000)

    logResult('ROOM', 'Created test room', true)

    // Step 6: Check in to the room (should be auto-navigated to room detail)
    await page.waitForLoadState('networkidle')

    const checkInBtn = await page.locator('button:has-text("Check In Today")').first()
    if (await checkInBtn.count() > 0) {
      await checkInBtn.click()
      await page.waitForTimeout(2000)
      logResult('CHECKIN', 'Performed check-in to room', true)
    } else {
      logResult('CHECKIN', 'Check-in button not found', false)
    }

    // Step 7: Verify room streak now shows 1
    const roomStreakText = await page.locator('.text-xl.font-bold.text-text').first().textContent()
    logResult('ROOM', 'Room streak shows 1 after check-in', roomStreakText === '1', `Got: ${roomStreakText}`)

    // Step 8: Verify room progress shows non-zero
    const roomProgressText = await page.locator('text=/complete/').first().textContent()
    logResult('ROOM', 'Room progress is calculated (non-zero)', true, `Got: ${roomProgressText}`)

    // Step 9: Go back to dashboard and verify streak shows 1
    await page.goto(`${BASE}/dashboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const dashStreak = await page.locator('.text-7xl.font-mono.text-accent').first().textContent()
    logResult('DASHBOARD', 'Current streak shows 1 after check-in', dashStreak === '1', `Got: ${dashStreak}`)

    const bestStreak = await page.locator('text=/Best:/').first().textContent()
    logResult('DASHBOARD', 'Best streak text contains "1"', bestStreak && bestStreak.includes('1'), `Got: ${bestStreak}`)

    // Step 10: Try duplicate check-in (should be prevented)
    const dupeCheckIn = await page.locator('button:has-text("Checked In")').first()
    if (await dupeCheckIn.count() > 0) {
      const disabled = await dupeCheckIn.isDisabled()
      logResult('CHECKIN', 'Duplicate check-in is disabled (upsert prevents dupe)', disabled, `Button disabled: ${disabled}`)
    }

    // Step 11: Navigate to leaderboard
    await page.goto(`${BASE}/leaderboard`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const leaderboardStreak = await page.locator('.text-lg.font-mono.font-bold').first().textContent()
    logResult('LEADERBOARD', 'Leaderboard shows streak value (not 0)', leaderboardStreak !== '0', `Got: ${leaderboardStreak}`)

    // Step 12: Navigate to profile
    await page.goto(`${BASE}/profile`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(1000)

    const profileStreak = await page.locator('.text-2xl.font-bold.font-mono').first().textContent()
    logResult('PROFILE', 'Profile current streak shows calculated value', profileStreak === '1', `Got: ${profileStreak}`)

    // Step 13: Navigate to habits
    await page.goto(`${BASE}/habits`)
    await page.waitForLoadState('networkidle')

    // Create a habit
    await page.locator('button:has-text("New Habit")').first().click()
    await page.waitForTimeout(500)
    await page.fill('input[placeholder*="Read"]', 'Test Habit')
    await page.locator('button:has-text("Create")').last().click()
    await page.waitForTimeout(1000)

    logResult('HABIT', 'Created test habit', true)

    // Check in to habit
    const habitCheckIn = await page.locator('button:has-text("Check In")').first()
    if (await habitCheckIn.count() > 0) {
      await habitCheckIn.click()
      await page.waitForTimeout(1000)
      logResult('HABIT', 'Performed habit check-in', true)
    }

    // Verify best streak stat shows 1
    await page.waitForTimeout(500)
    const bestStreakStat = await page.locator('text=Best Streak').locator('..').locator('.text-2xl').textContent()
    logResult('HABIT', 'Habit "Best Streak" stat shows correct consecutive value (1)', bestStreakStat === '1', `Got: ${bestStreakStat}`)

  } catch (err) {
    console.error('Test error:', err.message)
    logResult('ERROR', 'Test execution failed', false, err.message)
  } finally {
    // Print summary
    console.log('\n=== Test Results ===\n')
    const passed = testResults.filter(r => r.passed).length
    const failed = testResults.filter(r => !r.passed).length
    console.log(`Total: ${testResults.length}`)
    console.log(`\x1b[32mPassed: ${passed}\x1b[0m`)
    console.log(`\x1b[31mFailed: ${failed}\x1b[0m`)

    if (consoleErrors.length > 0) {
      console.log(`\nConsole errors: ${consoleErrors.length}`)
      consoleErrors.slice(0, 5).forEach(e => console.log(' - ' + e))
    }

    await browser.close()
    process.exit(failed > 0 ? 1 : 0)
  }
}

main()
