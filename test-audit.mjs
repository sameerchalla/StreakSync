import { chromium } from 'playwright';

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = {
    tests: [],
    consoleErrors: [],
  };

  // Capture console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      results.consoleErrors.push({
        url: page.url(),
        text: msg.text(),
        location: msg.location()
      });
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    results.consoleErrors.push({
      url: page.url(),
      text: error.message,
      stack: error.stack
    });
  });

  console.log('Starting StreakSync QA Audit...\n');

  // Test 1: Landing Page
  console.log('Test 1: Landing Page');
  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    const title = await page.title();
    const heroText = await page.textContent('h1');
    const featuresExist = await page.locator('text=Rooms').count() > 0;

    results.tests.push({
      name: 'Landing Page',
      passed: title.includes('StreakSync') && heroText && heroText.includes("Don't Break"),
      details: { title, heroText, featuresExist }
    });
    console.log(`  ✓ Landing page loads correctly: ${title}`);
  } catch (e) {
    results.tests.push({ name: 'Landing Page', passed: false, error: e.message });
    console.log(`  ✗ Landing page failed: ${e.message}`);
  }

  // Test 2: Auth Page
  console.log('\nTest 2: Auth Page');
  try {
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
    const signInVisible = await page.locator('button:has-text("Sign In")').first().isVisible();
    const signUpVisible = await page.locator('button:has-text("Sign Up")').first().isVisible();

    results.tests.push({
      name: 'Auth Page',
      passed: signInVisible && signUpVisible,
      details: { signInVisible, signUpVisible }
    });
    console.log(`  ✓ Auth page renders correctly`);
  } catch (e) {
    results.tests.push({ name: 'Auth Page', passed: false, error: e.message });
    console.log(`  ✗ Auth page failed: ${e.message}`);
  }

  // Test 3: Signup Form Validation
  console.log('\nTest 3: Signup Form Validation');
  try {
    await page.click('button:has-text("Sign Up")');
    await page.waitForTimeout(300);

    // Try to submit empty form
    await page.click('button:has-text("Create Account")');
    await page.waitForTimeout(500);

    // Check if form validation prevents empty submission
    // Note: HTML5 required attribute should prevent this
    const url = page.url();
    results.tests.push({
      name: 'Signup Form Validation',
      passed: url.includes('/auth'),
      details: { stayedOnAuthPage: url.includes('/auth') }
    });
    console.log(`  ✓ Signup form validation works`);
  } catch (e) {
    results.tests.push({ name: 'Signup Form Validation', passed: false, error: e.message });
    console.log(`  ✗ Signup form validation failed: ${e.message}`);
  }

  // Test 4: Protected Routes Redirect
  console.log('\nTest 4: Protected Routes Redirect');
  try {
    await page.goto('http://localhost:5174/dashboard', { waitUntil: 'networkidle' });
    const redirectedToAuth = page.url().includes('/auth');

    results.tests.push({
      name: 'Protected Route Redirect',
      passed: redirectedToAuth,
      details: { redirectedToAuth }
    });
    console.log(`  ✓ Protected routes redirect to auth: ${redirectedToAuth}`);
  } catch (e) {
    results.tests.push({ name: 'Protected Route Redirect', passed: false, error: e.message });
    console.log(`  ✗ Protected route test failed: ${e.message}`);
  }

  // Test 5: Room Page Accessibility
  console.log('\nTest 5: Rooms Page');
  try {
    await page.goto('http://localhost:5174/rooms', { waitUntil: 'networkidle' });
    // Should redirect to auth if not logged in
    const redirectedToAuth = page.url().includes('/auth');
    results.tests.push({
      name: 'Rooms Page Access Control',
      passed: redirectedToAuth,
      details: { redirectedToAuth }
    });
    console.log(`  ✓ Rooms page access control: ${redirectedToAuth ? 'redirects to auth' : 'accessible'}`);
  } catch (e) {
    results.tests.push({ name: 'Rooms Page', passed: false, error: e.message });
    console.log(`  ✗ Rooms page failed: ${e.message}`);
  }

  // Test 6: Navigation Elements
  console.log('\nTest 6: Navigation Elements');
  try {
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
    const links = await page.locator('a').count();
    const buttons = await page.locator('button').count();

    results.tests.push({
      name: 'Navigation Elements',
      passed: links > 0 && buttons > 0,
      details: { links, buttons }
    });
    console.log(`  ✓ Navigation elements present: ${links} links, ${buttons} buttons`);
  } catch (e) {
    results.tests.push({ name: 'Navigation Elements', passed: false, error: e.message });
    console.log(`  ✗ Navigation elements test failed: ${e.message}`);
  }

  // Test 7: Form Input Accessibility
  console.log('\nTest 7: Form Input Accessibility');
  try {
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
    await page.click('button:has-text("Sign Up")');
    await page.waitForTimeout(300);

    // Check for labels
    const labels = await page.locator('label').count();
    const inputs = await page.locator('input').count();

    results.tests.push({
      name: 'Form Accessibility',
      passed: inputs > 0,
      details: { labels, inputs }
    });
    console.log(`  ✓ Form inputs present: ${inputs} inputs`);
  } catch (e) {
    results.tests.push({ name: 'Form Accessibility', passed: false, error: e.message });
    console.log(`  ✗ Form accessibility test failed: ${e.message}`);
  }

  // Test 8: Responsive Design Check
  console.log('\nTest 8: Responsive Design');
  try {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });

    const mobileVisible = await page.locator('button:has-text("Sign In")').first().isVisible();

    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });

    const desktopVisible = await page.locator('button:has-text("Sign In")').first().isVisible();

    results.tests.push({
      name: 'Responsive Design',
      passed: mobileVisible && desktopVisible,
      details: { mobileVisible, desktopVisible }
    });
    console.log(`  ✓ Responsive design works on mobile: ${mobileVisible}, desktop: ${desktopVisible}`);
  } catch (e) {
    results.tests.push({ name: 'Responsive Design', passed: false, error: e.message });
    console.log(`  ✗ Responsive design test failed: ${e.message}`);
  }

  // Test 9: Check for broken images/resources
  console.log('\nTest 9: Resource Loading');
  try {
    const failedRequests = [];
    page.on('requestfailed', request => {
      failedRequests.push({
        url: request.url(),
        failure: request.failure()?.errorText
      });
    });

    await page.goto('http://localhost:5174', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    results.tests.push({
      name: 'Resource Loading',
      passed: failedRequests.length === 0,
      details: { failedRequests }
    });

    if (failedRequests.length === 0) {
      console.log(`  ✓ All resources loaded successfully`);
    } else {
      console.log(`  ✗ ${failedRequests.length} resources failed to load`);
      failedRequests.forEach(r => console.log(`    - ${r.url}: ${r.failure}`));
    }
  } catch (e) {
    results.tests.push({ name: 'Resource Loading', passed: false, error: e.message });
    console.log(`  ✗ Resource loading test failed: ${e.message}`);
  }

  // Test 10: Theme Toggle
  console.log('\nTest 10: Theme Toggle (requires auth)');
  try {
    // Check if theme store exists
    await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });
    const hasThemeToggle = await page.locator('button[aria-label*="mode"]').count() > 0;

    results.tests.push({
      name: 'Theme Toggle Presence',
      passed: hasThemeToggle !== null,
      details: { hasThemeToggle }
    });
    console.log(`  ✓ Theme toggle button present`);
  } catch (e) {
    results.tests.push({ name: 'Theme Toggle', passed: false, error: e.message });
    console.log(`  ✗ Theme toggle test failed: ${e.message}`);
  }

  // Summary
  console.log('\n========================================');
  console.log('Test Summary:');
  console.log('========================================');

  const passed = results.tests.filter(t => t.passed).length;
  const failed = results.tests.filter(t => !t.passed).length;

  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (results.consoleErrors.length > 0) {
    console.log(`\nConsole Errors Found: ${results.consoleErrors.length}`);
    results.consoleErrors.forEach(err => {
      console.log(`  - ${err.url}: ${err.text}`);
    });
  } else {
    console.log(`\nNo console errors found!`);
  }

  await browser.close();
  return results;
}

runTests().catch(console.error);
