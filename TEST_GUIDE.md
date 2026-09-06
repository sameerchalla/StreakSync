# StreakSync QA & Verification Guide

This guide covers manual verification steps and automated test execution for StreakSync. Use it to validate the application during hackathon demos, code reviews, or before deployment.

---

## Automated Tests

### Unit Tests

Run the full unit test suite:

```bash
npm run test:run
```

Expected output:
```
Test Files  1 passed (1)
     Tests  32 passed (32)
  Duration  ~2-3s
```

All tests cover streak calculation logic, timezone helpers, and XP derivation. They run in a vitest environment with no external dependencies.

### Database Integrity Audit

Run the production integrity checks:

```bash
npm run audit:db
```

This script verifies three invariants against the live database:

| Check | What It Tests |
|-------|---------------|
| XP Invariant | `xp === total_checkins * 10` for all profiles |
| Streak Invariant | `current_streak >= 0`, `longest_streak >= 0`, `longest_streak >= current_streak` |
| Room Quorum Invariant | `streak_min_members >= 1` for all rooms |

Exit code `0` means all checks passed. Exit code `1` means anomalies were detected.

### TypeScript Compilation

Verify no type errors:

```bash
npx tsc -b
```

Clean output (no errors, no warnings) means the codebase is type-safe.

---

## Manual Verification Steps

Work through these scenarios in order. Each one targets a specific feature area.

### 1. New User Registration & Timezone Detection

**Goal:** Verify that a new user gets their timezone captured automatically.

**Steps:**
1. Sign out if logged in
2. Click "Sign Up" and create a new account (use a throwaway email or Google OAuth)
3. After auth completes, the app should redirect to the Dashboard
4. Open browser DevTools → Application → Storage → Cookies (or localStorage)
5. Look for the `profile` object or query the `profiles` table in Supabase
6. Verify `profiles.timezone` contains a valid IANA timezone string (e.g., `"America/New_York"`, not `"UTC"` unless that's genuinely the browser timezone)

**Pass criteria:** The timezone field contains the actual browser timezone, not the hardcoded default.

---

### 2. Individual Habit Tracking & Personal Streak Increments

**Goal:** Verify that checking into a room increments the personal streak correctly.

**Prerequisites:** A logged-in user with at least one joined room.

**Steps:**
1. On the Dashboard, locate the "Today's Check-ins" section
2. Note the current "Current Streak" number displayed at the top
3. Click the "Check in" button for any room that shows "Not done"
4. Observe:
   - The button changes to "Done" with a green checkmark
   - If this is a consecutive day, the streak counter increments by 1
5. Click "Check in" for another room — the personal streak should not increment again (it's per day, not per room)
6. Wait for midnight in your timezone (or manually verify via Supabase) and check that the streak resets if you skip a day

**Pass criteria:**
- Streak increments on first check-in of the day
- Streak does not double-count if user checks into multiple rooms
- XP increases by 10 per unique day checked in

---

### 3. Room Creation with Quorum Requirements

**Goal:** Verify that room streaks respect the `streak_min_members` threshold.

**Steps:**
1. Navigate to "Create a Room" (from Dashboard quick actions or Rooms page)
2. Fill in the form:
   - Name: "Quorum Test Room"
   - Icon: any emoji
   - Color: any hex
   - Streak Goal: 30
   - **Quorum Minimum Members: 2** (key field)
3. Create the room
4. The room appears in your Dashboard
5. Check in — observe that the room's collective streak does **not** increment (you are the only member)
6. Ask a second user to join the room and check in
7. After the second user's check-in, the room's collective streak should increment to 1

**Pass criteria:**
- A single-member room cannot grow its collective streak past 0
- The quorum requirement forces real accountability before the room "counts"

---

### 4. Real-Time Leaderboard Updates

**Goal:** Verify that leaderboards reflect the latest check-ins without a page refresh.

**Steps:**
1. Open two different browsers (or one incognito) and log in as two different users
2. Both users should join the same room
3. Have User A check in — the leaderboard in that room should update
4. Have User B check in — User A's rank may shift
5. Check the global Leaderboard page — the updated XP values should appear

**Pass criteria:** If using Supabase Realtime subscriptions, leaderboard updates appear without manual refresh. If Realtime is not active, a manual page refresh should show updated values.

---

## Troubleshooting

### Check-in not incrementing streak

1. Verify the user's `profiles.timezone` matches their actual timezone
2. Check the `check_ins` table directly — confirm the `check_in_date` matches `today_in_tz(timezone)`
3. Run `npm run audit:db` to catch any invariant violations

### XP mismatch

1. Run `npm run audit:db` — it will report which profiles have incorrect XP
2. The cause is likely a stale trigger state; re-trigger by inserting a dummy check-in and deleting it

### Room streak stuck at 0 despite quorum

1. Verify `streak_min_members` on the room
2. Check `check_ins` for that room today — confirm at least that many users have rows
3. The `update_room_streaks_on_checkin` trigger runs per statement, so check the SQL function logic

### TypeScript errors after pulling

```bash
npm install
npx tsc -b
```

This ensures all type definitions and node_modules are in sync.

---

## Test Environment Notes

- Tests run against the **live Supabase database** configured in `.env.local`
- The audit script reads data only — it performs no inserts, updates, or deletes
- For isolated testing, use a separate Supabase project and point `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to it
- The 32 unit tests in `src/__tests__/` use mocked Supabase clients and require no external connectivity

---

## Quick Verification Checklist

Run this before a demo:

```bash
npm run test:run    # 32/32 tests green
npm run audit:db    # 3/3 invariants pass
npx tsc -b         # zero errors
```

If all three pass, the application is in a known-good state.
