-- ============================================
-- 009: Fix rooms_with_stats view to include visibility and room_code
-- ============================================

drop view if exists public.rooms_with_stats cascade;

create or replace view public.rooms_with_stats as
select
  r.id,
  r.name,
  r.description,
  r.icon,
  r.color,
  r.goal,
  r.frequency,
  r.streak_goal,
  r.streak_min_members,
  r.created_by,
  r.current_room_streak,
  r.max_room_streak,
  r.created_at,
  r.is_public,
  r.visibility,
  r.room_code,
  coalesce(m.member_count, 0) as member_count
from public.rooms r
left join (
  select room_id, count(*) as member_count
  from public.room_members
  where is_active = true
  group by room_id
) m on m.room_id = r.id;

-- Allow lookup of private rooms by code for joining (security through code)
-- Private rooms are readable when looked up by exact room_code match
CREATE POLICY IF NOT EXISTS "rooms_lookup_by_code" ON public.rooms
  FOR SELECT
  USING (
    visibility = 'public'
    OR is_public = true
    OR auth.uid() = created_by
    OR public.is_room_member(auth.uid(), id)
    OR room_code = current_setting('app.current_room_code', true)
  );
