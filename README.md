# 🔥 StreakSync

> **Social Habit Accountability Platform** — Don't break the streak, don't let your team down.

StreakSync is a social accountability and habit tracking platform featuring personal streaks, quorum-based room streaks, and dynamic leaderboards. Users join habit rooms where collective streaks create accountability — miss a day, and you let your team down.

## Features

- **Habit Rooms** — Join rooms like "100 Days of Code" or "Daily 6 AM Gym"
- **Collective Streaks** — Your check-in keeps the room's streak alive
- **Leaderboards** — Compete within rooms and globally
- **XP & Levels** — Earn experience points for every check-in
- **Analytics** — GitHub-style contribution heatmaps and streak charts
- **Individual Habits** — Personal tracker alongside your rooms
- **Timezone-Aware** — Streaks computed in your local timezone

---

## Core Architecture & Highlights

### Timezone-Aware Streaks

StreakSync prevents date-boundary shifts through coordinated client and server logic:

- **Client:** `todayInTimezone(tz)` in [src/lib/timezone.ts](src/lib/timezone.ts) returns the calendar date string for "now" in a given IANA timezone (e.g., `"America/New_York"`)
- **Database:** `today_in_tz(tz)` PostgreSQL function computes `((now() at time zone tz)::date)` for trigger logic
- **Profile:** User timezone is stored at signup and synced on session if the browser timezone differs

### Quorum-Based Room Accountability

Rooms require configurable participation before incrementing collective streaks:

- Each room has a `streak_min_members` column (default: 1)
- A room's daily streak only increments if at least `streak_min_members` distinct members checked in that day
- This prevents solo users from trivially keeping rooms alive while enabling tight-knit accountability groups

### Strict Database Idempotency

XP and streak calculations are protected by database constraints and triggers:

- `check_ins` table has a unique constraint on `(user_id, room_id, check_in_date)` — duplicate inserts are rejected
- `update_streaks_on_checkin` trigger derives `current_streak`, `longest_streak`, and `total_checkins` from check-in history
- `update_room_streaks_on_checkin` trigger computes room-level participation and collective streak
- XP is always calculated as `total_checkins * 10` — never stored independently

---

## Setup & Installation

### Prerequisites

- Node.js 18+
- A Supabase project (free tier works)

### Environment Configuration

Create `.env.local` in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Copy from `.env.example` if available.

### Installation

```bash
npm install
```

### Database Migrations

Run the migrations in order through the Supabase SQL Editor (Dashboard → SQL Editor):

1. `supabase/migrations/001_initial_schema.sql` — Core tables and functions
2. `supabase/migrations/002_fix_streak_calculation.sql` — Streak calculation fixes
3. `supabase/migrations/003_streaks_quorum_timezone.sql` — Quorum thresholds and timezone support

Alternatively, apply them programmatically using your own deployment tooling.

### Running Locally

```bash
npm run dev
```

The app will be available at `http://localhost:5173`.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build (TypeScript check + Vite bundle) |
| `npm run test:run` | Execute Vitest unit test suite |
| `npm run audit:db` | Run database integrity audit (XP, streaks, quorum invariants) |
| `npm run lint` | Run ESLint (oxlint) |

---

## Project Structure

```
streakSync/
├── src/
│   ├── pages/
│   │   ├── Dashboard.tsx      # Main hub with room check-ins
│   │   ├── Rooms.tsx          # Room discovery
│   │   ├── RoomDetail.tsx     # Individual room with leaderboard
│   │   ├── CreateRoom.tsx     # Room creation form
│   │   ├── Habits.tsx         # Individual habit tracker
│   │   ├── Leaderboard.tsx    # Global rankings
│   │   ├── Profile.tsx        # User profile and stats
│   │   ├── Auth.tsx           # Login/Signup
│   │   └── Landing.tsx        # Public landing page
│   ├── components/
│   │   └── Layout.tsx         # Navigation shell
│   ├── lib/
│   │   ├── supabase.ts        # Supabase client
│   │   ├── types.ts           # TypeScript types
│   │   ├── streakUtils.ts     # Client-side streak calculation
│   │   └── timezone.ts        # Timezone helpers
│   ├── store/
│   │   ├── authStore.ts       # Zustand auth state
│   │   └── themeStore.ts      # Theme preferences
│   └── __tests__/             # Vitest unit tests
├── scripts/
│   └── audit-db-integrity.mjs # Database integrity audit
├── supabase/
│   └── migrations/            # SQL migration files
└── package.json
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| State | Zustand + TanStack Query |
| Routing | React Router v7 |
| Backend | Supabase (PostgreSQL + Auth + Realtime) |
| Charts | Recharts |
| Icons | Lucide React |
| Dates | date-fns |

---

## License

MIT
