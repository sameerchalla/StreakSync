-- ============================================
-- StreakSync Migration 003
-- Streaks: quorum-aware room streaks, timezone-aware
-- personal/room anchors, DB-level XP idempotency.
-- ============================================
--
-- This migration supersedes 002_fix_streak_calculation.sql.
-- It is safe to apply on a database that has 002 applied OR
-- has not had 002 applied. It also fixes a latent double-XP
-- hazard: migration 001's `award_checkin_xp` trigger fires
-- AFTER INSERT and bumps `xp += 10` unconditionally, and
-- migration 002 (if applied) ALSO recomputes `xp =
-- total_checkins * 10` after INSERT OR UPDATE. Both firing
-- on the same row would inflate XP.
--
-- Decisions implemented:
--   PD1: XP / total_checkins are awarded exactly once per
--        (user_id, room_id, check_in_date). The unique
--        constraint on check_ins is the source of truth for
--        "this is a new check-in". Triggers run on AFTER
--        INSERT ONLY for the XP-issuing logic.
--   PD2: Room streak requires at least
--        `rooms.streak_min_members` distinct members to
--        have a check-in on a given day. Default 1.
--   PD3: Streak anchors are timezone-aware. Personal streak
--        uses `profiles.timezone`. Room streak uses the
--        room creator's `profiles.timezone`.
--
-- Non-destructive: this migration only ADDs objects and
-- DROPS the broken pre-existing `award_xp_on_checkin`
-- trigger and its function. It does NOT delete or rewrite
-- any check_ins or profiles rows. It DOES recompute
-- current_streak / longest_streak / current_room_streak /
-- max_room_streak for all existing rows from their existing
-- check_in_date values (preserving the dates already
-- written by the client).
-- ============================================

-- ============================================
-- 0. Remove the broken XP trigger from 001.
--    Migration 002 (if applied) also leaves this in place,
--    which would double-count XP. We replace it below with
--    a single, idempotent, INSERT-only logic.
-- ============================================
drop trigger if exists award_xp_on_checkin on public.check_ins;
drop function if exists public.award_checkin_xp();
drop function if exists public.calculate_user_streak(uuid);  -- the broken one from 001

-- Drop migration 002 objects if they were ever applied.
-- All of these are CREATE OR REPLACE / DROP IF EXISTS, so
-- this is safe whether or not 002 was applied.
drop trigger if exists update_streaks_on_checkin on public.check_ins;
drop trigger if exists update_room_streaks_on_checkin on public.check_ins;
drop function if exists public.update_profile_streaks();
drop function if exists public.update_room_streaks();
drop function if exists public.calculate_user_streak(uuid);
drop function if exists public.calculate_user_current_streak(uuid);
drop function if exists public.calculate_user_current_streak(uuid, date);
drop function if exists public.calculate_user_longest_streak(uuid);
drop function if exists public.calculate_room_current_streak(uuid);
drop function if exists public.calculate_room_current_streak(uuid, date);

-- ============================================
-- 1. Add quorum column to rooms (PD2).
--    Default 1 preserves the previous "any member" semantic.
-- ============================================
alter table public.rooms
  add column if not exists streak_min_members int not null default 1
  check (streak_min_members >= 1);

-- ============================================
-- 2. Timezone-aware "today" helper.
--    Resolves a timestamp in a given IANA timezone to a
--    calendar date. Used by both personal and room streak
--    functions so that a user in UTC+10 sees their day
--    roll over at their local midnight, not at UTC midnight.
-- ============================================
create or replace function public.today_in_tz(tz text)
returns date
language sql
stable
as $$
  select ((now() at time zone coalesce(nullif(tz, ''), 'UTC'))::date);
$$;

-- ============================================
-- 3. Personal current-streak function (PD3).
--    Computes the consecutive run of check-in dates for
--    `target_user_id` that ends on the user's local "today"
--    (or yesterday, to allow a 1-day grace window).
--    Same-day duplicates are ignored via DISTINCT.
-- ============================================
create or replace function public.calculate_user_current_streak(
  target_user_id uuid,
  target_date date default null
)
returns int
language plpgsql
stable
as $$
declare
  user_tz text;
  anchor  date;
  streak  int := 0;
  sorted_dates date[];
  i int;
  prev_date date;
begin
  -- Look up the user's timezone, defaulting to UTC.
  select coalesce(timezone, 'UTC') into user_tz
  from public.profiles
  where id = target_user_id;

  if user_tz is null then
    user_tz := 'UTC';
  end if;

  -- Use caller-provided anchor (the date the client wrote
  -- the check-in for) if given; otherwise the user's
  -- "today" in their local timezone.
  if target_date is not null then
    anchor := target_date;
  else
    anchor := public.today_in_tz(user_tz);
  end if;

  -- Get all distinct check-in dates for the user, newest first.
  select array_agg(check_in_date order by check_in_date desc)
    into sorted_dates
  from (
    select distinct check_in_date
    from public.check_ins
    where user_id = target_user_id
  ) d;

  if sorted_dates is null or array_length(sorted_dates, 1) = 0 then
    return 0;
  end if;

  -- If the most recent check-in is older than yesterday
  -- relative to the anchor, the streak is 0.
  if sorted_dates[1] < anchor - interval '1 day' then
    return 0;
  end if;

  streak := 1;
  prev_date := sorted_dates[1];

  for i in 2..array_length(sorted_dates, 1) loop
    if sorted_dates[i] = prev_date - 1 then
      streak := streak + 1;
      prev_date := sorted_dates[i];
    elsif sorted_dates[i] = prev_date then
      -- Same day, skip without breaking.
      continue;
    else
      -- Gap, stop counting.
      exit;
    end if;
  end loop;

  return streak;
end;
$$;

-- ============================================
-- 4. Personal longest-streak function (PD3).
--    Same as above but finds the longest run anywhere in
--    history. No anchor required; we use the user's
--    timezone only to ensure that the "duplicate same day"
--    treatment is consistent with what the current-streak
--    function does.
-- ============================================
create or replace function public.calculate_user_longest_streak(
  target_user_id uuid
)
returns int
language plpgsql
stable
as $$
declare
  longest  int := 1;
  current_run int := 1;
  sorted_dates date[];
  prev_date date;
  i int;
  diff int;
begin
  select array_agg(check_in_date order by check_in_date asc)
    into sorted_dates
  from (
    select distinct check_in_date
    from public.check_ins
    where user_id = target_user_id
  ) d;

  if sorted_dates is null or array_length(sorted_dates, 1) = 0 then
    return 0;
  end if;

  if array_length(sorted_dates, 1) = 1 then
    return 1;
  end if;

  longest := 1;
  current_run := 1;
  prev_date := sorted_dates[1];

  for i in 2..array_length(sorted_dates, 1) loop
    diff := prev_date - sorted_dates[i];  -- negative if consecutive

    if diff = -1 then
      current_run := current_run + 1;
      longest := greatest(longest, current_run);
    elsif diff = 0 then
      continue;
    else
      current_run := 1;
    end if;

    prev_date := sorted_dates[i];
  end loop;

  return longest;
end;
$$;

-- ============================================
-- 5. Room current-streak function (PD2 + PD3).
--    Counts consecutive days, anchored at the room creator's
--    "today", on which at least `rooms.streak_min_members`
--    DISTINCT members have a check-in. Default quorum is 1,
--    matching the old "any member" behavior.
-- ============================================
create or replace function public.calculate_room_current_streak(
  target_room_id uuid,
  target_date date default null
)
returns int
language plpgsql
stable
as $$
declare
  creator_tz text := 'UTC';
  anchor     date;
  quorum     int := 1;
  streak     int := 0;
begin
  -- Resolve creator timezone + quorum for the room.
  select coalesce(p.timezone, 'UTC'), coalesce(r.streak_min_members, 1)
    into creator_tz, quorum
  from public.rooms r
  left join public.profiles p on p.id = r.created_by
  where r.id = target_room_id;

  if creator_tz is null then
    creator_tz := 'UTC';
  end if;

  if target_date is not null then
    anchor := target_date;
  else
    anchor := public.today_in_tz(creator_tz);
  end if;

  -- Find the consecutive run ending on the anchor day (or
  -- yesterday, to allow a 1-day grace). A day "counts" if
  -- at least `quorum` distinct members checked in.
  with daily_counts as (
    select
      check_in_date,
      count(distinct user_id) as member_count
    from public.check_ins
    where room_id = target_room_id
    group by check_in_date
  ),
  qualifying_days as (
    select check_in_date
    from daily_counts
    where member_count >= quorum
  ),
  ranked as (
    select
      check_in_date,
      check_in_date - row_number() over (
        order by check_in_date desc
      )::int as grp
    from qualifying_days
  )
  select count(*) into streak
  from ranked
  where grp = (
    select grp
    from ranked
    where check_in_date = anchor
       or check_in_date = anchor - interval '1 day'
    order by check_in_date desc
    limit 1
  );

  -- If today has a qualifying check-in but the gap-and-
  -- island query above returned 0 (e.g. the room is brand
  -- new and this is its very first qualifying day), the
  -- streak is 1.
  if streak = 0 and exists (
    select 1
    from public.check_ins ci
    where ci.room_id = target_room_id
      and ci.check_in_date = anchor
    group by ci.check_in_date
    having count(distinct ci.user_id) >= quorum
  ) then
    streak := 1;
  end if;

  return coalesce(streak, 0);
end;
$$;

-- ============================================
-- 6. Canonical streak update function.
--    Called by the trigger on every check-in INSERT. It
--    recomputes total_checkins, xp, current_streak, and
--    longest_streak for the user. Because this trigger is
--    AFTER INSERT ONLY, and because (user_id, room_id,
--    check_in_date) is UNIQUE, each insertion represents
--    exactly one new check-in. There is no UPDATE path
--    here, so XP cannot be double-credited.
-- ============================================
create or replace function public.update_profile_streaks()
returns trigger
language plpgsql
as $$
declare
  user_current int;
  user_longest int;
  user_max     int;
  total_ci     int;
begin
  user_current := public.calculate_user_current_streak(
    new.user_id, new.check_in_date
  );
  user_longest := public.calculate_user_longest_streak(new.user_id);

  -- Compute authoritative total_checkins by counting rows.
  -- We do NOT increment a counter; the COUNT is the truth.
  select count(*) into total_ci
  from public.check_ins
  where user_id = new.user_id;

  -- Preserve the existing max(current_streak, longest_streak)
  -- so that backfill does not regress any user's longest
  -- streak to a smaller historical value.
  select greatest(coalesce(longest_streak, 0),
                  coalesce(current_streak, 0))
    into user_max
  from public.profiles
  where id = new.user_id;

  update public.profiles
  set
    total_checkins = total_ci,
    current_streak = user_current,
    longest_streak = greatest(user_longest, user_max),
    xp = total_ci * 10
  where id = new.user_id;

  return new;
end;
$$;

-- ============================================
-- 7. Canonical room-streak update function.
--    Called by the trigger on every check-in INSERT.
-- ============================================
create or replace function public.update_room_streaks()
returns trigger
language plpgsql
as $$
declare
  room_current int;
  room_max     int;
begin
  room_current := public.calculate_room_current_streak(
    new.room_id, new.check_in_date
  );

  select greatest(coalesce(max_room_streak, 0),
                  coalesce(current_room_streak, 0))
    into room_max
  from public.rooms
  where id = new.room_id;

  update public.rooms
  set
    current_room_streak = room_current,
    max_room_streak = greatest(room_current, room_max)
  where id = new.room_id;

  return new;
end;
$$;

-- ============================================
-- 8. Triggers: AFTER INSERT ONLY.
--    On any UPDATE of a check-in (e.g. editing a note),
--    these triggers do NOT fire, so XP cannot be
--    double-credited by an UPDATE path.
-- ============================================
create trigger update_streaks_on_checkin
  after insert on public.check_ins
  for each row execute procedure public.update_profile_streaks();

create trigger update_room_streaks_on_checkin
  after insert on public.check_ins
  for each row execute procedure public.update_room_streaks();

-- ============================================
-- 9. Backfill existing rows.
--    Recomputes current_streak, longest_streak,
--    total_checkins, xp for all profiles; and
--    current_room_streak, max_room_streak for all rooms.
--    Does NOT touch check_ins rows.
-- ============================================
update public.profiles p set
  current_streak = public.calculate_user_current_streak(p.id),
  longest_streak = greatest(
    coalesce(p.longest_streak, 0),
    public.calculate_user_longest_streak(p.id)
  ),
  total_checkins = (
    select count(*) from public.check_ins where user_id = p.id
  ),
  xp = (
    select count(*) * 10 from public.check_ins where user_id = p.id
  );

update public.rooms r set
  current_room_streak = public.calculate_room_current_streak(r.id),
  max_room_streak = greatest(
    coalesce(r.max_room_streak, 0),
    public.calculate_room_current_streak(r.id)
  );

-- ============================================
-- Done. Streaks are now quorum-aware, timezone-aware,
-- and XP is awarded exactly once per (user, room, date).
-- ============================================
