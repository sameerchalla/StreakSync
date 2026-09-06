import { chromium } from 'playwright';

async function testStreakBug() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto('http://localhost:5174/auth', { waitUntil: 'networkidle' });

  console.log('Testing Streak Calculation Logic...\n');

  const results = await page.evaluate(async () => {
    const { calculateStreak, calculateLongestStreak } = await import('./src/lib/streakUtils.ts');

    const testCases = [
      {
        name: 'Case 1: Simple consecutive days',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        today: '2024-01-03',
        expected: { streak: 3, longest: 3 }
      },
      {
        name: 'Case 2: Gap in middle',
        dates: ['2024-01-01', '2024-01-02', '2024-01-04', '2024-01-05'],
        today: '2024-01-05',
        expected: { streak: 2, longest: 2 }
      },
      {
        name: 'Case 3: Today not checked in',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        today: '2024-01-04',
        expected: { streak: 0, longest: 3 }
      },
      {
        name: 'Case 4: Yesterday checked in',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03'],
        today: '2024-01-04',
        expected: { streak: 0, longest: 3 }
      },
      {
        name: 'Case 5: Only today checked in',
        dates: ['2024-01-03'],
        today: '2024-01-03',
        expected: { streak: 1, longest: 1 }
      },
      {
        name: 'Case 6: Empty dates',
        dates: [],
        today: '2024-01-03',
        expected: { streak: 0, longest: 0 }
      },
      {
        name: 'Case 7: Streak from yesterday only',
        dates: ['2024-01-02', '2024-01-03'],
        today: '2024-01-04',
        expected: { streak: 0, longest: 2 }
      },
      {
        name: 'Case 8: Multiple check-ins same day',
        dates: ['2024-01-01', '2024-01-01', '2024-01-02', '2024-01-02'],
        today: '2024-01-02',
        expected: { streak: 2, longest: 2 }
      },
      {
        name: 'Case 9: Streak broken by 2 days',
        dates: ['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-06'],
        today: '2024-01-06',
        expected: { streak: 1, longest: 3 }
      }
    ];

    return testCases.map(tc => {
      const streak = calculateStreak(tc.dates, tc.today);
      const longest = calculateLongestStreak(tc.dates);

      return {
        ...tc,
        actual: { streak, longest },
        streakPass: streak === tc.expected.streak,
        longestPass: longest === tc.expected.longest
      };
    });
  });

  let allPassed = true;
  results.forEach(tc => {
    const streakStatus = tc.streakPass ? '✓' : '✗ BUG';
    const longestStatus = tc.longestPass ? '✓' : '✗ BUG';

    console.log(`${tc.name}:`);
    console.log(`  Dates: ${tc.dates.join(', ') || '(empty)'}`);
    console.log(`  Today: ${tc.today}`);
    console.log(`  Streak: expected=${tc.expected.streak}, actual=${tc.actual.streak} ${streakStatus}`);
    console.log(`  Longest: expected=${tc.expected.longest}, actual=${tc.actual.longest} ${longestStatus}`);
    console.log('');

    if (!tc.streakPass || !tc.longestPass) allPassed = false;
  });

  console.log('========================================');
  console.log(allPassed ? 'All streak tests passed!' : 'Some streak tests FAILED!');

  await browser.close();
}

testStreakBug().catch(console.error);
