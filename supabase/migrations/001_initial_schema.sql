-- ============================================
-- StreakSync Database Schema
-- ============================================
-- Run this in your Supabase SQL Editor
-- https://supabase.com/dashboard/project/_/sql

-- ============================================
-- 1. PROFILES (extends auth.users)
-- ============================================
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  display_name text,
  avatar_url text,
  timezone text default 'UTC',
  current_streak int default 0,
  longest_streak int default 0,
  total_checkins int default 0,
  level int default 1,
  xp int default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Public profiles are viewable by everyone" on public.profiles;
create policy "Public profiles are viewable by everyone"
  on public.profiles for select
  using ( true );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using ( auth.uid() = id );

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check ( auth.uid() = id );

-- Trigger: auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8)),
    new.raw_user_meta_data->>'username'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- 2. ROOMS (habit rooms)
-- ============================================
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  icon text default '🔥',
  color text default '#6366F1',
  goal text not null,
  frequency text default 'daily' check (frequency in ('daily', 'weekly', 'custom')),
  check_in_time time,
  streak_goal int default 30,
  is_public boolean default true,
  created_by uuid references public.profiles(id) on delete set null,
  current_room_streak int default 0,
  max_room_streak int default 0,
  created_at timestamptz default now()
);

alter table public.rooms enable row level security;

drop policy if exists "Public rooms are viewable by everyone" on public.rooms;
create policy "Public rooms are viewable by everyone"
  on public.rooms for select
  using ( is_public = true or auth.uid() = created_by );

drop policy if exists "Authenticated users can create rooms" on public.rooms;
create policy "Authenticated users can create rooms"
  on public.rooms for insert
  with check ( auth.uid() = created_by );

drop policy if exists "Room creators can update their rooms" on public.rooms;
create policy "Room creators can update their rooms"
  on public.rooms for update
  using ( auth.uid() = created_by );

drop policy if exists "Room creators can delete their rooms" on public.rooms;
create policy "Room creators can delete their rooms"
  on public.rooms for delete
  using ( auth.uid() = created_by );

-- ============================================
-- 3. ROOM MEMBERSHIPS
-- ============================================
create table if not exists public.room_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  joined_at timestamptz default now(),
  is_active boolean default true,
  unique(user_id, room_id)
);

alter table public.room_members enable row level security;

drop policy if exists "Room members are viewable by everyone" on public.room_members;
create policy "Room members are viewable by everyone"
  on public.room_members for select
  using ( true );

drop policy if exists "Users can join rooms" on public.room_members;
create policy "Users can join rooms"
  on public.room_members for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can leave rooms" on public.room_members;
create policy "Users can leave rooms"
  on public.room_members for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete their memberships" on public.room_members;
create policy "Users can delete their memberships"
  on public.room_members for delete
  using ( auth.uid() = user_id );

-- ============================================
-- 4. CHECK-INS (core interaction)
-- ============================================
create table if not exists public.check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete cascade,
  check_in_date date not null,
  completed boolean default true,
  note text,
  created_at timestamptz default now(),
  unique(user_id, room_id, check_in_date)
);

alter table public.check_ins enable row level security;

drop policy if exists "Check-ins are viewable by everyone" on public.check_ins;
create policy "Check-ins are viewable by everyone"
  on public.check_ins for select
  using ( true );

drop policy if exists "Users can create their own check-ins" on public.check_ins;
create policy "Users can create their own check-ins"
  on public.check_ins for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update their own check-ins" on public.check_ins;
create policy "Users can update their own check-ins"
  on public.check_ins for update
  using ( auth.uid() = user_id );

-- Create index for fast lookups
create index if not exists idx_checkins_user_date
  on public.check_ins(user_id, check_in_date desc);

create index if not exists idx_checkins_room_date
  on public.check_ins(room_id, check_in_date desc);

-- ============================================
-- 5. INDIVIDUAL HABITS
-- ============================================
create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  icon text default '✓',
  color text default '#6366F1',
  frequency text default 'daily' check (frequency in ('daily', 'weekly', 'custom')),
  created_at timestamptz default now()
);

alter table public.habits enable row level security;

drop policy if exists "Users can view their own habits" on public.habits;
create policy "Users can view their own habits"
  on public.habits for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can create their own habits" on public.habits;
create policy "Users can create their own habits"
  on public.habits for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update their own habits" on public.habits;
create policy "Users can update their own habits"
  on public.habits for update
  using ( auth.uid() = user_id );

drop policy if exists "Users can delete their own habits" on public.habits;
create policy "Users can delete their own habits"
  on public.habits for delete
  using ( auth.uid() = user_id );

-- ============================================
-- 6. HABIT LOGS
-- ============================================
create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid references public.habits(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  completed_date date not null,
  completed boolean default true,
  unique(habit_id, completed_date)
);

alter table public.habit_logs enable row level security;

drop policy if exists "Users can view their own habit logs" on public.habit_logs;
create policy "Users can view their own habit logs"
  on public.habit_logs for select
  using ( auth.uid() = user_id );

drop policy if exists "Users can create their own habit logs" on public.habit_logs;
create policy "Users can create their own habit logs"
  on public.habit_logs for insert
  with check ( auth.uid() = user_id );

drop policy if exists "Users can update their own habit logs" on public.habit_logs;
create policy "Users can update their own habit logs"
  on public.habit_logs for update
  using ( auth.uid() = user_id );

create index if not exists idx_habitlogs_user_date
  on public.habit_logs(user_id, completed_date desc);

-- ============================================
-- 7. VIEWS for common queries
-- ============================================

-- View: Room with member count
create or replace view public.rooms_with_stats as
select
  r.*,
  coalesce(m.member_count, 0) as member_count
from public.rooms r
left join (
  select room_id, count(*) as member_count
  from public.room_members
  where is_active = true
  group by room_id
) m on m.room_id = r.id;

-- View: Global leaderboard (top streakers)
create or replace view public.global_leaderboard as
select
  p.*,
  rank() over (order by p.current_streak desc, p.total_checkins desc) as rank
from public.profiles p
order by p.current_streak desc, p.total_checkins desc;

-- ============================================
-- 8. FUNCTIONS
-- ============================================

-- Function: Calculate user streak from check-in dates
create or replace function public.calculate_user_streak(target_user_id uuid)
returns int
language plpgsql
as $$
declare
  streak int := 0;
  last_date date;
  current_date date := current_date;
begin
  select check_in_date into last_date
  from public.check_ins
  where user_id = target_user_id
  order by check_in_date desc
  limit 1;

  if last_date is null or last_date < current_date - interval '1 day' then
    return 0;
  end if;

  select count(*) into streak
  from (
    select
      check_in_date,
      check_in_date - (row_number() over (order by check_in_date))::int as grp
    from public.check_ins
    where user_id = target_user_id
  ) sub
  where grp = (
    select check_in_date - 1
    from public.check_ins
    where user_id = target_user_id
    order by check_in_date desc
    limit 1
  );

  return streak;
end;
$$;

-- Function: Award XP for check-in
create or replace function public.award_checkin_xp()
returns trigger
language plpgsql
as $$
begin
  update public.profiles
  set
    total_checkins = total_checkins + 1,
    xp = xp + 10
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists award_xp_on_checkin on public.check_ins;
create trigger award_xp_on_checkin
  after insert on public.check_ins
  for each row execute procedure public.award_checkin_xp();

-- ============================================
-- 9. SAMPLE DATA (optional)
-- ============================================

-- Uncomment below to seed sample rooms
/*
insert into public.rooms (name, description, goal, icon, color, streak_goal, is_public, current_room_streak)
values
  ('100 Days of Code', 'Code every day for 100 days', 'Code for at least 1 hour', '💻', '#6366F1', 100, true, 47),
  ('Daily 6 AM Gym', 'Early morning workouts', 'Exercise for 30+ minutes', '🏋️', '#F97316', 90, true, 31),
  ('Read 30 Minutes', 'Build a reading habit', 'Read for 30 minutes', '📚', '#22C55E', 60, true, 19),
  ('Meditation Challenge', 'Daily mindfulness', 'Meditate for 10 minutes', '🧘', '#8B5CF6', 100, true, 56);
*/

-- ============================================
-- Done! Your database is ready.
-- ============================================