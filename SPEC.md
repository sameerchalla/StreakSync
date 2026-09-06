# StreakSync — Product Specification

## 1. Concept & Vision

StreakSync is a **social habit accountability platform** that transforms solo habit tracking into a community experience. The core mechanic is simple: users join "habit rooms" where collective streaks create accountability — miss a day, and you let your team down. This social pressure dramatically outperforms solo apps in retention.

The vibe is **high-energy, gamified, dark-mode-first** — like Discord meets Linear. The interface should feel premium, alive, and reward-heavy. Every check-in should feel satisfying.

## 2. Design Language

### Aesthetic Direction
**"Neon Accountability"** — A dark-first, high-energy aesthetic with electric accent colors that match the "streak fire" gamification energy. Think Discord meets Linear, with premium polish.

### Color Palette
```
Background:    #0D0D0F  (near-black)
Surface:       #16161A  (cards, modals)
Border:        #2A2A32  (subtle dividers)
Primary:       #6366F1  (indigo — main actions)
Accent:        #F97316  (orange — fire, streaks, energy)
Success:       #22C55E  (green — completed, active)
Danger:        #EF4444  (red — missed, danger)
Text:          #F4F4F5  (near-white)
Muted:         #71717A  (gray)
```

### Typography
- **Headings:** Syne (700 weight, bold) — geometric, quirky, distinctive
- **Body:** Outfit (400-500 weight) — clean, modern, readable
- **Mono/Stats:** JetBrains Mono (for streak numbers, XP counts)
- **Scale:** 2.5rem (h1) → 2rem (h2) → 1.5rem (h3) → 1.25rem (h4) → body

### Spatial System
- Base unit: 4px
- Card padding: 24px (6 units)
- Section gaps: 32px (8 units)
- Border radius: 8px (sm), 12px (md), 16px (lg), 24px (xl)

### Motion Philosophy
- **Micro-interactions:** 150-200ms ease-out transitions on hover
- **Check-in celebration:** Confetti burst + fire pulse animation
- **Streak milestones:** Scale bounce + confetti (7, 30, 100 days)
- **Loading states:** Smooth skeleton shimmer, not spinners
- **Page transitions:** Fade in 300ms

### Visual Assets
- **Icons:** Lucide React (consistent, clean line icons)
- **Room icons:** Emoji (💻 🏋️ 📚 🧘 etc.) for personality
- **Emojis for streaks:** 🔥 escalating intensity based on streak length
- **Gradients:** Orange/amber for fire elements, indigo/violet for primary

## 3. Layout & Structure

### Page Architecture
```
├── Landing (public)
│   └── Hero, Features, Social Proof, CTA
├── Auth (public)
│   └── Login/Signup with Google OAuth + Magic Link
├── Dashboard (protected)
│   ├── Stats Grid (streaks, XP, level)
│   ├── Today's Check-ins (room cards)
│   └── Quick Actions
├── Rooms (protected)
│   ├── Search & Filter
│   └── Room Grid (discovery)
├── Room Detail (protected)
│   ├── Room Header + Banner
│   ├── Collective Progress
│   ├── Today's Check-in Button
│   └── Room Leaderboard
├── Create Room (protected)
│   └── Room Creation Form
├── Habits (protected)
│   ├── Stats Overview
│   ├── Habit Cards (individual tracking)
│   └── Mini Streak Charts
├── Leaderboard (protected)
│   ├── Top 3 Podium
│   └── Full Rankings
└── Profile (protected)
    ├── Avatar & Level
    ├── Stats Grid
    ├── Activity Heatmap (GitHub-style)
    └── Achievements
```

### Responsive Strategy
- Mobile-first with bottom tab bar
- Desktop: sidebar navigation + wider content
- Breakpoints: sm (640px), md (768px), lg (1024px)

## 4. Database Entities

### profiles
```sql
id              UUID PRIMARY KEY REFERENCES auth.users(id)
username        TEXT UNIQUE NOT NULL
display_name    TEXT
avatar_url      TEXT
timezone        TEXT DEFAULT 'UTC'
xp              INTEGER DEFAULT 0
current_streak  INTEGER DEFAULT 0
longest_streak  INTEGER DEFAULT 0
total_checkins  INTEGER DEFAULT 0
level           INTEGER DEFAULT 1
created_at      TIMESTAMPTZ DEFAULT now()
```

### rooms
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
name                 TEXT NOT NULL
description          TEXT
icon                 TEXT DEFAULT '🔥'
color                TEXT DEFAULT '#F97316'
creator_id           UUID REFERENCES profiles(id)
streak_goal          INTEGER DEFAULT 30
streak_min_members   INTEGER DEFAULT 1  -- quorum threshold
current_room_streak  INTEGER DEFAULT 0
created_at           TIMESTAMPTZ DEFAULT now()
```

### check_ins
```sql
id             UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id        UUID REFERENCES profiles(id) NOT NULL
room_id        UUID REFERENCES rooms(id) NOT NULL
check_in_date  DATE NOT NULL  -- stored in user's profile timezone
completed      BOOLEAN DEFAULT true
created_at     TIMESTAMPTZ DEFAULT now()

UNIQUE (user_id, room_id, check_in_date)  -- prevents duplicate check-ins
```

### room_members
```sql
room_id     UUID REFERENCES rooms(id)
user_id     UUID REFERENCES profiles(id)
joined_at   TIMESTAMPTZ DEFAULT now()
is_active   BOOLEAN DEFAULT true

PRIMARY KEY (room_id, user_id)
```

### habits
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID REFERENCES profiles(id)
name        TEXT NOT NULL
icon        TEXT DEFAULT '🎯'
color       TEXT DEFAULT '#6366F1'
created_at  TIMESTAMPTZ DEFAULT now()
```

### habit_logs
```sql
habit_id       UUID REFERENCES habits(id)
log_date       DATE NOT NULL
completed      BOOLEAN DEFAULT true

PRIMARY KEY (habit_id, log_date)
```

## 5. Business Logic & Invariants

### Personal Streaks

A user's **personal streak** is the count of consecutive calendar days on which they checked into at least one room, computed in the user's localized timezone.

**Rules:**
1. The streak is anchored to `profiles.timezone` (not UTC or browser local time)
2. A day is "checked in" if there exists at least one `check_ins` row for that user with `check_in_date = today_in_tz(timezone)` and `completed = true`
3. The streak resets to 0 when a gap of one or more calendar days is detected
4. The "longest streak" is the maximum value ever reached and never decreases

**Implementation:**
- `calculate_user_current_streak(user_id)` — SQL function in migration 003
- `calculateStreak(dates[], todayStr)` — client-side utility in `streakUtils.ts`

### Room Streaks

A room's **collective streak** requires quorum participation before incrementing.

**Rules:**
1. For a given calendar day, count distinct users who checked into the room (`completed = true`)
2. If `count >= rooms.streak_min_members`, the room's `current_room_streak` increments
3. If the quorum is not met, the room streak resets to 0
4. The streak is computed for each user's timezone day independently

**Quorum invariant:** `streak_min_members >= 1` for all rooms (enforced by audit script)

### XP Calculation

XP is a strict function of check-in count with no independent state:

```
xp = total_checkins * 10
```

**Rules:**
1. `total_checkins` is the count of distinct `(user_id, room_id, check_in_date)` rows for the user with `completed = true`
2. XP is always derived, never stored independently
3. The trigger `update_streaks_on_checkin` maintains this invariant on every insert/delete to `check_ins`
4. Duplicate inserts are rejected by the unique constraint, preventing XP inflation

### Timezone Handling

**At signup:**
1. Capture `Intl.DateTimeFormat().resolvedOptions().timeZone` from the browser
2. Store it in `profiles.timezone`

**On dashboard load (Phase 5 mitigation):**
1. Compare `profile.timezone` with current browser timezone
2. If different and profile timezone is not 'UTC', silently update `profiles.timezone`
3. Use `sessionStorage` flag to ensure only one sync per session

**Check-in date computation:**
- Client: `todayInTimezone(tz)` → `yyyy-MM-dd` string
- Server: `today_in_tz(tz)` → `date` type

## 6. API & Trigger Specifications

### Triggers on `public.check_ins`

#### `update_streaks_on_checkin`

Fires: `AFTER INSERT OR DELETE ON public.check_ins FOR EACH STATEMENT`

Logic:
1. On INSERT: increment `profiles.total_checkins`, recompute `profiles.xp`, recalculate `current_streak` and `longest_streak`
2. On DELETE: decrement `profiles.total_checkins`, recompute `profiles.xp`, recalculate streaks
3. Uses `calculate_user_current_streak(user_id)` and `calculate_user_longest_streak(user_id)` functions

#### `update_room_streaks_on_checkin`

Fires: `AFTER INSERT OR DELETE ON public.check_ins FOR EACH STATEMENT`

Logic:
1. Determine the check-in date in UTC (stored value)
2. Query distinct users who checked in for that date
3. Compare count against `rooms.streak_min_members`
4. If quorum met: increment `rooms.current_room_streak`; else: reset to 0

### SQL Functions

#### `today_in_tz(tz TEXT) RETURNS DATE`
```sql
SELECT ((now() at time zone tz)::date);
```

#### `calculate_user_current_streak(user_id UUID) RETURNS INTEGER`
Walks backward from today counting consecutive checked-in days in the user's timezone.

#### `calculate_user_longest_streak(user_id UUID) RETURNS INTEGER`
Scans all check-in dates to find the maximum consecutive run.

## 7. Component Inventory

### Buttons
- **Primary:** Indigo bg, white text, hover:scale-105
- **Accent:** Orange gradient bg, white text (check-in)
- **Ghost:** Transparent, border, hover:bg-surface
- **Icon:** Circle, icon only, tooltip on hover
- **States:** Loading (spinner), disabled (opacity-50), success (green)

### Cards
- **Room Card:** Icon, name, streak bar, member count, join button
- **Habit Card:** Icon, name, streak, mini chart, check-in button
- **Stat Card:** Icon, label, value, optional progress bar
- **User Card:** Avatar, name, streak, rank badge

### Forms
- **Inputs:** Dark bg, border, focus:border-primary
- **Textarea:** Same as input, resize-none
- **Select:** Custom dropdown with icons
- **Radio/Toggle:** Custom styled with primary color
- **Validation:** Red border + error message below

### Navigation
- **Sidebar (desktop):** Fixed left, icon + label
- **Bottom tabs (mobile):** Fixed bottom, icon + label
- **Top bar:** Logo, user menu, sign out

### Feedback
- **Toast:** Bottom-right, slide-in, auto-dismiss
- **Modal:** Centered, backdrop blur, escape to close
- **Skeleton:** Shimmer animation while loading
- **Empty state:** Illustration + CTA

## 8. Technical Approach

### Stack
- **Frontend:** React 19 + Vite + TypeScript
- **Styling:** Tailwind CSS v4 + CSS custom properties
- **State:** Zustand (auth) + TanStack Query (server state)
- **Routing:** React Router v7
- **Backend:** Supabase (PostgreSQL + Auth + Realtime)
- **Charts:** Recharts
- **Icons:** Lucide React
- **Dates:** date-fns
- **Deployment:** Vercel

### Environment Variables
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## 9. Demo Mode

When Supabase is not configured, the app displays **realistic demo data**:
- 3 pre-joined rooms with varied streaks
- Sample leaderboard with top streakers
- 3 personal habits with partial completion
- Stats that look credible for hackathon demos

This allows the app to be demoed immediately without backend setup.
