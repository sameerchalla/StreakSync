--- ============================================
-- 008: Break RLS infinite recursion between rooms and room_members
-- ============================================

-- 1. Helper function to check room membership (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_room_member(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.room_members
    WHERE user_id = _user_id
      AND room_id = _room_id
      AND is_active = true
  );
$$;

-- 2. Helper function to check if room is public (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_room_public(_room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = _room_id
      AND (visibility = 'public' OR is_public = true)
  );
$$;

-- 3. Helper function to check if user created the room (SECURITY DEFINER bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_room_creator(_user_id uuid, _room_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rooms
    WHERE id = _room_id
      AND created_by = _user_id
  );
$$;

-- ============================================
-- 4. Recreate rooms SELECT policy without inline subquery to room_members
-- ============================================
DROP POLICY IF EXISTS "Public rooms are viewable by everyone" ON public.rooms;
DROP POLICY IF EXISTS "rooms_visibility_based_access" ON public.rooms;
DROP POLICY IF EXISTS "rooms_select_policy" ON public.rooms;

CREATE POLICY "rooms_select_policy" ON public.rooms
  FOR SELECT
  USING (
    visibility = 'public'
    OR is_public = true
    OR auth.uid() = created_by
    OR public.is_room_member(auth.uid(), id)
  );

-- ============================================
-- 5. Recreate room_members SELECT policy without inline subquery to rooms
-- ============================================
DROP POLICY IF EXISTS "Room members are viewable by everyone" ON public.room_members;
DROP POLICY IF EXISTS "room_members_select_policy" ON public.room_members;

CREATE POLICY "room_members_select_policy" ON public.room_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_room_public(room_id)
    OR public.is_room_creator(auth.uid(), room_id)
  );

-- ============================================
-- 6. Recreate check_ins SELECT policy without inline subquery to rooms
-- ============================================
DROP POLICY IF EXISTS "Check-ins are viewable by everyone" ON public.check_ins;
DROP POLICY IF EXISTS "check_ins_select_policy" ON public.check_ins;

CREATE POLICY "check_ins_select_policy" ON public.check_ins
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      room_id IS NOT NULL
      AND public.is_room_public(room_id)
    )
  );

-- ============================================
-- 7. Recreate room_join_requests policies with helper function
-- ============================================
DROP POLICY IF EXISTS "join_requests_owners_view" ON public.room_join_requests;
DROP POLICY IF EXISTS "join_requests_owners_manage" ON public.room_join_requests;

CREATE POLICY "join_requests_owners_view" ON public.room_join_requests
  FOR SELECT
  USING (public.is_room_creator(auth.uid(), room_id));

CREATE POLICY "join_requests_owners_manage" ON public.room_join_requests
  FOR UPDATE
  USING (public.is_room_creator(auth.uid(), room_id));
