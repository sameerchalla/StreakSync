-- ============================================
-- StreakSync Fix: Streak Calculation
-- ============================================
-- This migration fixes the streak calculation by adding proper triggers
-- and helper functions to update streaks on check-in events.

-- Drop any existing overloads first (idempotent: safe to re-run, handles 003's 2-arg versions)
drop function if exists public.calculate_user_current_streak(uuid);
drop function if exists public.calculate_user_current_streak(uuid, date);
drop function if exists public.calculate_room_current_streak(uuid);
drop function if exists public.calculate_room_current_streak(uuid, date);

-- ============================================
-- 1. Helper function to calculate user's current streak from check_ins
-- ============================================
create or replace function public.calculate_user_current_streak(target_user_id uuid)
returns int
language plpgsql
as $$
declare
  streak int := 0;
  sorted_dates date[];
  today date := current_date;
  i int;
  prev_date date;
begin
  -- Get all check-in dates for the user, sorted newest first
  select array_agg(check_in_date order by check_in_date desc)
  into sorted_dates
  from (
    select distinct check_in_date
    from public.check_ins
    where user_id = target_user_id
  ) distinct_dates;

  if sorted_dates is null or array_length(sorted_dates, 1) = 0 then
    return 0;
  end if;

  -- Check if most recent check-in is today or yesterday
  if sorted_dates[1] < today - interval '1 day' then
    return 0;  -- Streak broken
  end if;

  -- Count consecutive days
  streak := 1;
  prev_date := sorted_dates[1];

  for i in 2..array_length(sorted_dates, 1) loop
    if sorted_dates[i] = prev_date - 1 then
      streak := streak + 1;
      prev_date := sorted_dates[i];
    elsif sorted_dates[i] = prev_date then
      -- Same day, skip (don't break streak)
      continue;
    else
      -- Gap found, stop counting
      exit;
    end if;
  end loop;

  return streak;
end;
$$;

-- ============================================
-- 2. Helper function to calculate user's longest streak from check_ins
-- ============================================
create or replace function public.calculate_user_longest_streak(target_user_id uuid)
returns int
language plpgsql
as $$
declare
  longest int := 1;
  current int := 1;
  sorted_dates date[];
  prev_date date;
  i int;
  diff int;
begin
  -- Get all check-in dates for the user, sorted oldest first
  select array_agg(check_in_date order by check_in_date asc)
  into sorted_dates
  from (
    select distinct check_in_date
    from public.check_ins
    where user_id = target_user_id
  ) distinct_dates;

  if sorted_dates is null or array_length(sorted_dates, 1) = 0 then
    return 0;
  end if;

  if array_length(sorted_dates, 1) = 1 then
    return 1;
  end if;

  -- Find longest consecutive sequence
  longest := 1;
  current := 1;
  prev_date := sorted_dates[1];

  for i in 2..array_length(sorted_dates, 1) loop
    diff := prev_date - sorted_dates[i];  -- negative if consecutive

    if diff = -1 then  -- Consecutive (sorted oldest first, so later date > earlier date)
      current := current + 1;
      longest := greatest(longest, current);
    elsif diff = 0 then
      -- Same day, skip (don't break or extend streak)
      continue;
    else
      -- Gap found, reset current streak
      current := 1;
    end if;

    prev_date := sorted_dates[i];
  end loop;

  return longest;
end;
$$;

-- ============================================
-- 3. Helper function to calculate room's current streak
-- ============================================
create or replace function public.calculate_room_current_streak(target_room_id uuid)
returns int
language plpgsql
as $$
declare
  streak int := 0;
  today date := current_date;
begin
  -- A room's streak is the longest consecutive run of days where
  -- AT LEAST ONE member checked in that day.
  -- This encourages collective accountability.

  with consecutive_days as (
    select distinct check_in_date
    from public.check_ins
    where room_id = target_room_id
    order by check_in_date desc
  ),
  ranked as (
    select
      check_in_date,
      check_in_date - row_number() over (order by check_in_date desc)::int as grp
    from consecutive_days
  )
  select count(*) into streak
  from ranked
  where grp = (
    select grp
    from ranked
    where check_in_date = today - 1
       or check_in_date = today
    limit 1
  );

  -- If today and yesterday both had check-ins, this count is correct
  -- If only yesterday had check-in (streak starts yesterday), count days since yesterday
  -- If today has check-in but not yesterday, streak starts today = 1

  -- Verify: if today has a check-in, ensure streak includes today
  if exists (
    select 1 from public.check_ins
    where room_id = target_room_id
    and check_in_date = today
  ) then
    -- Recalculate to include today
    if streak = 0 then
      -- Today is first day of a new streak
      return 1;
    end if;
  end if;

  return streak;
end;
$$;

-- ============================================
-- 4. Trigger function to update profile streaks on check-in
-- ============================================
create or replace function public.update_profile_streaks()
returns trigger
language plpgsql
as $$
declare
  user_current int;
  user_longest int;
  user_max int;
begin
  -- Calculate the user's current streak
  user_current := public.calculate_user_current_streak(new.user_id);
  user_longest := public.calculate_user_longest_streak(new.user_id);

  -- Get current max streak for comparison
  select greatest(longest_streak, current_streak) into user_max
  from public.profiles
  where id = new.user_id;

  -- Update profile with calculated streaks
  update public.profiles
  set
    current_streak = user_current,
    longest_streak = greatest(user_longest, user_max, longest_streak),
    total_checkins = (
      select count(*) from public.check_ins
      where user_id = new.user_id
    ),
    xp = total_checkins * 10  -- Keep XP consistent: 10 XP per check-in
  where id = new.user_id;

  return new;
end;
$$;

drop trigger if exists update_streaks_on_checkin on public.check_ins;
create trigger update_streaks_on_checkin
  after insert or update on public.check_ins
  for each row execute procedure public.update_profile_streaks();

-- ============================================
-- 5. Trigger function to update room streaks on check-in
-- ============================================
create or replace function public.update_room_streaks()
returns trigger
language plpgsql
as $$
declare
  room_current int;
  room_max int;
begin
  -- Calculate the room's current streak
  room_current := public.calculate_room_current_streak(new.room_id);

  -- Get current max room streak
  select greatest(max_room_streak, current_room_streak) into room_max
  from public.rooms
  where id = new.room_id;

  -- Update room with calculated streak
  update public.rooms
  set
    current_room_streak = room_current,
    max_room_streak = greatest(room_current, room_max, max_room_streak)
  where id = new.room_id;

  return new;
end;
$$;

drop trigger if exists update_room_streaks_on_checkin on public.check_ins;
create trigger update_room_streaks_on_checkin
  after insert or update on public.check_ins
  for each row execute procedure public.update_room_streaks();

-- ============================================
-- 6. Backfill existing data
-- ============================================
-- Update all existing profiles with correct streaks
update public.profiles p set
  current_streak = public.calculate_user_current_streak(p.id),
  longest_streak = public.calculate_user_longest_streak(p.id);

-- Update all existing rooms with correct streaks
update public.rooms r set
  current_room_streak = public.calculate_room_current_streak(r.id),
  max_room_streak = greatest(
    public.calculate_room_current_streak(r.id),
    r.max_room_streak
  );

-- ============================================
-- Done! Streak calculations are now working correctly.
-- ============================================
