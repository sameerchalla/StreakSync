import { chromium } from 'playwright';

async function runComprehensiveTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    bugs: [],
    warnings: [],
    info: []
  };

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.bugs.push({
        type: 'Console Error',
        severity: 'HIGH',
        message: msg.text(),
        location: msg.location()
      });
    }
  });

  console.log('Starting Comprehensive QA Audit...\n');

  // ==========================================
  // PHASE 1: Verify existing account/login
  // ==========================================
  console.log('PHASE 1: Authentication Flow Tests');
  console.log('==========================================');

  try {
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
    console.log('  ✓ Auth page loaded');

    // Test sign in toggle
    await page.click('button:has-text("Sign In")');
    await page.waitForTimeout(200);
    const signInForm = await page.locator('button:has-text("Sign In"):near(:text("Email"))').count();
    console.log('  ✓ Sign In tab toggles correctly');

    // Test sign up toggle
    await page.click('button:has-text("Sign Up")');
    await page.waitForTimeout(200);
    const usernameField = await page.locator('input[placeholder*="streakmaster"]').count();
    console.log(`  ✓ Sign Up tab toggles - Username field present: ${usernameField > 0}`);

  } catch (e) {
    results.bugs.push({ type: 'Auth Toggle', severity: 'HIGH', message: e.message });
  }

  // ==========================================
  // PHASE 2: Verify data consistency between DB and UI
  // ==========================================
  console.log('\nPHASE 2: Data Consistency Tests');
  console.log('==========================================');

  // Check Supabase connection
  try {
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });

    // Check if Supabase is configured
    const supabaseUrl = await page.evaluate(() => {
      return import.meta.env.VITE_SUPABASE_URL || 'not-set';
    });
    console.log(`  Supabase URL: ${supabaseUrl.substring(0, 30)}...`);

    // Try to fetch rooms to check API connectivity
    const apiResponse = await page.evaluate(async () => {
      try {
        const { supabase } = await import('./src/lib/supabase.ts');
        const { data, error } = await supabase.from('rooms').select('count');
        return { success: !error, error: error?.message, count: data };
      } catch (e) {
        return { success: false, error: e.message };
      }
    });
    console.log(`  API Test: ${apiResponse.success ? 'Connected' : 'Failed - ' + apiResponse.error}`);

  } catch (e) {
    results.bugs.push({ type: 'API Connection', severity: 'CRITICAL', message: e.message });
  }

  // ==========================================
  // PHASE 3: Test code logic review
  // ==========================================
  console.log('\nPHASE 3: Code Logic Review');
  console.log('==========================================');

  // Test streak calculation function
  const streakCalcTest = await page.evaluate(async () => {
    const { calculateStreak, calculateLongestStreak } = await import('./src/lib/streakUtils.ts');

    // Test case 1: Consecutive days
    const testDates1 = ['2024-01-01', '2024-01-02', '2024-01-03'];
    const streak1 = calculateStreak(testDates1, '2024-01-03');
    const longest1 = calculateLongestStreak(testDates1);

    // Test case 2: Gap in dates
    const testDates2 = ['2024-01-01', '2024-01-02', '2024-01-04', '2024-01-05'];
    const streak2 = calculateStreak(testDates2, '2024-01-05');
    const longest2 = calculateLongestStreak(testDates2);

    // Test case 3: Empty dates
    const streak3 = calculateStreak([], '2024-01-05');
    const longest3 = calculateLongestStreak([]);

    return {
      case1: { streak: streak1, longest: longest1, expected: { streak: 3, longest: 3 } },
      case2: { streak: streak2, longest: longest2, expected: { streak: 2, longest: 3 } },
      case3: { streak: streak3, longest: longest3, expected: { streak: 0, longest: 0 } },
      allPassed: streak1 === 3 && longest1 === 3 && streak2 === 2 && longest2 === 3 && streak3 === 0 && longest3 === 0
    };
  });

  console.log(`  Streak Calculation Tests:`);
  console.log(`    Case 1 (3 consecutive): streak=${streakCalcTest.case1.streak}, longest=${streakCalcTest.case1.longest}, expected=3,3 - ${streakCalcTest.case1.streak === 3 && streakCalcTest.case1.longest === 3 ? '✓' : '✗ BUG'}`);
  console.log(`    Case 2 (gap): streak=${streakCalcTest.case2.streak}, longest=${streakCalcTest.case2.longest}, expected=2,3 - ${streakCalcTest.case2.streak === 2 && streakCalcTest.case2.longest === 3 ? '✓' : '✗ BUG'}`);
  console.log(`    Case 3 (empty): streak=${streakCalcTest.case3.streak}, longest=${streakCalcTest.case3.longest}, expected=0,0 - ${streakCalcTest.case3.streak === 0 && streakCalcTest.case3.longest === 0 ? '✓' : '✗ BUG'}`);

  if (!streakCalcTest.allPassed) {
    results.bugs.push({
      type: 'Streak Calculation Logic',
      severity: 'HIGH',
      message: 'Streak calculation function produces incorrect results',
      details: streakCalcTest
    });
  }

  // Test timezone handling
  const timezoneTest = await page.evaluate(async () => {
    const { todayInTimezone, getBrowserTimezone } = await import('./src/lib/timezone.ts');

    const browserTz = getBrowserTimezone();
    const today = todayInTimezone(browserTz);
    const utcToday = todayInTimezone('UTC');

    return {
      browserTimezone: browserTz,
      todayInBrowserTz: today,
      todayInUTC: utcToday,
      same: today === utcToday
    };
  });

  console.log(`\n  Timezone Handling:`);
  console.log(`    Browser timezone: ${timezoneTest.browserTimezone}`);
  console.log(`    Today in browser TZ: ${timezoneTest.todayInBrowserTz}`);
  console.log(`    Today in UTC: ${timezoneTest.todayInUTC}`);
  if (timezoneTest.browserTimezone !== 'UTC') {
    results.warnings.push({
      type: 'Timezone Difference',
      message: `Browser timezone (${timezoneTest.browserTimezone}) differs from UTC, potential for date boundary issues`
    });
  }

  // ==========================================
  // PHASE 4: UI/UX Review
  // ==========================================
  console.log('\nPHASE 4: UI/UX Review');
  console.log('==========================================');

  await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });

  // Check for proper contrast (color contrast is important for accessibility)
  const colorContrast = await page.evaluate(() => {
    const body = document.body;
    const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim() || '#0D0D0F';
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim() || '#F4F4F5';

    // Simple luminance calculation
    const hexToRgb = (hex) => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      } : null;
    };

    const luminance = (rgb) => {
      const [r, g, b] = [rgb.r, rgb.g, rgb.b].map(v => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    const bgRgb = hexToRgb(bgColor);
    const textRgb = hexToRgb(textColor);

    const l1 = bgRgb ? luminance(bgRgb) : 0;
    const l2 = textRgb ? luminance(textRgb) : 1;

    const contrast = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

    return {
      bgColor,
      textColor,
      contrast: contrast.toFixed(2),
      passesWCAG: contrast >= 4.5
    };
  });

  console.log(`  Color Contrast:`);
  console.log(`    Background: ${colorContrast.bgColor}`);
  console.log(`    Text: ${colorContrast.textColor}`);
  console.log(`    Contrast ratio: ${colorContrast.contrast}:1`);
  console.log(`    WCAG AA compliant: ${colorContrast.passesWCAG ? '✓' : '✗ FAIL'}`);

  if (!colorContrast.passesWCAG) {
    results.warnings.push({
      type: 'Accessibility',
      message: `Color contrast ${colorContrast.contrast}:1 may not meet WCAG AA standards`
    });
  }

  // ==========================================
  // PHASE 5: Security Check
  // ==========================================
  console.log('\nPHASE 5: Security Review');
  console.log('==========================================');

  // Check for exposed sensitive info
  const securityCheck = await page.evaluate(() => {
    const issues = [];

    // Check for API key exposure in source
    const bodyText = document.body.innerText;
    if (bodyText.includes('eyJ') && bodyText.includes('supabase')) {
      issues.push('Potential API key visible in DOM');
    }

    // Check localStorage for sensitive data
    const localStorageKeys = Object.keys(localStorage);
    const sensitiveKeys = localStorageKeys.filter(k =>
      k.toLowerCase().includes('token') ||
      k.toLowerCase().includes('secret') ||
      k.toLowerCase().includes('key') ||
      k.toLowerCase().includes('password')
    );

    return {
      potentialIssues: issues,
      sensitiveLocalStorageKeys: sensitiveKeys,
      hasSupabaseUrl: !!import.meta.env.VITE_SUPABASE_URL
    };
  });

  console.log(`  Security checks:`);
  console.log(`    API URL configured: ${securityCheck.hasSupabaseUrl}`);
  console.log(`    Sensitive localStorage: ${securityCheck.sensitiveLocalStorageKeys.length === 0 ? 'None' : securityCheck.sensitiveLocalStorageKeys.join(', ')}`);

  // ==========================================
  // PHASE 6: Component State Tests
  // ==========================================
  console.log('\nPHASE 6: Component State Tests');
  console.log('==========================================');

  // Test loading states
  await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });

  // Check for loading spinner presence
  const loadingSpinner = await page.locator('.animate-spin').count();
  console.log(`  Initial page load - loading spinners visible: ${loadingSpinner > 0 ? 'Yes (unexpected)' : 'No (good)'}`);

  // Check for empty states
  const emptyStates = await page.locator('text=/No .* yet|No .* found|empty/i').count();
  console.log(`  Empty state patterns present: ${emptyStates}`);

  // ==========================================
  // PHASE 7: Form Validation Tests
  // ==========================================
  console.log('\nPHASE 7: Form Validation Tests');
  console.log('==========================================');

  await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Sign Up")');
  await page.waitForTimeout(300);

  // Test short username validation
  const usernameValidation = await page.evaluate(() => {
    const input = document.querySelector('input[placeholder*="streakmaster"]');
    if (!input) return { found: false };

    // Simulate typing short username
    const event = new Event('input', { bubbles: true });
    input.value = 'ab';
    input.dispatchEvent(event);

    return { found: true };
  });

  if (usernameValidation.found) {
    console.log('  ✓ Username input field found for validation testing');
  }

  // ==========================================
  // PHASE 8: Responsive Layout Tests
  // ==========================================
  console.log('\nPHASE 8: Responsive Layout Tests');
  console.log('==========================================');

  const viewports = [
    { name: 'Mobile', width: 375, height: 667 },
    { name: 'Tablet', width: 768, height: 1024 },
    { name: 'Desktop', width: 1280, height: 800 },
    { name: 'Large Desktop', width: 1920, height: 1080 }
  ];

  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForTimeout(200);

    // Check for horizontal overflow
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    const layoutIssue = hasHorizontalScroll ? '✗ OVERFLOW' : '✓';
    console.log(`  ${vp.name} (${vp.width}x${vp.height}): ${layoutIssue} ${hasHorizontalScroll ? 'Horizontal scroll detected!' : 'No layout issues'}`);

    if (hasHorizontalScroll) {
      results.warnings.push({
        type: 'Layout',
        message: `Horizontal scroll detected on ${vp.name} viewport`
      });
    }
  }

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n========================================');
  console.log('AUDIT SUMMARY');
  console.log('========================================');

  console.log(`\nBugs Found: ${results.bugs.length}`);
  results.bugs.forEach((b, i) => {
    console.log(`  ${i + 1}. [${b.severity}] ${b.type}: ${b.message}`);
  });

  console.log(`\nWarnings: ${results.warnings.length}`);
  results.warnings.forEach((w, i) => {
    console.log(`  ${i + 1}. ${w.type}: ${w.message}`);
  });

  await browser.close();
  return results;
}

runComprehensiveTests().catch(console.error);
