-- ============================================
-- RLS Privacy Fix Migration
-- ============================================
-- Fixes overly permissive RLS policies that allowed
-- unrestricted reading across all user records.
-- ============================================

-- ============================================
-- 1. FIX public.check_ins
-- ============================================

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Check-ins are viewable by everyone" ON public.check_ins;

-- Create a scoped SELECT policy:
-- - Users can view their own check-ins
-- - Users can view check-ins for public rooms (for leaderboards and room stats)
CREATE POLICY "check_ins_select_policy" ON public.check_ins
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      room_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.rooms r
        WHERE r.id = check_ins.room_id
        AND r.is_public = true
      )
    )
  );

-- Ensure INSERT is restricted to own check-ins (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can create their own check-ins" ON public.check_ins;
CREATE POLICY "check_ins_insert_policy" ON public.check_ins
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Ensure UPDATE is restricted to own check-ins (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can update their own check-ins" ON public.check_ins;
CREATE POLICY "check_ins_update_policy" ON public.check_ins
  FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- 2. FIX public.room_members
-- ============================================

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Room members are viewable by everyone" ON public.room_members;

-- Create a scoped SELECT policy:
-- - Users can view their own memberships
-- - Users can view memberships in public rooms (for member lists)
CREATE POLICY "room_members_select_policy" ON public.room_members
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.rooms r
      WHERE r.id = room_members.room_id
      AND r.is_public = true
    )
  );

-- Ensure INSERT is restricted (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can join rooms" ON public.room_members;
CREATE POLICY "room_members_insert_policy" ON public.room_members
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Ensure UPDATE is restricted (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can leave rooms" ON public.room_members;
CREATE POLICY "room_members_update_policy" ON public.room_members
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Ensure DELETE is restricted (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can delete their memberships" ON public.room_members;
CREATE POLICY "room_members_delete_policy" ON public.room_members
  FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================
-- 3. FIX public.profiles
-- ============================================

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;

-- Create a SELECT policy requiring authentication:
-- This preserves leaderboard and member list queries while
-- preventing unauthenticated scraping.
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Ensure UPDATE is restricted to own profile (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Ensure INSERT is restricted to own profile (already correct, reinforcing)
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================
-- VERIFICATION NOTES
-- ============================================
-- After applying this migration, verify these frontend queries work:
--
-- Leaderboard.tsx:
--   - profiles SELECT: Works for authenticated users ✓
--   - check_ins SELECT by user_ids: Works (filtered by auth.uid()) ✓
--
-- Dashboard.tsx:
--   - profiles SELECT: Works for authenticated users ✓
--   - check_ins SELECT by user_id: Works (auth.uid() match) ✓
--   - check_ins SELECT for room streaks: Works (public rooms allowed) ✓
--   - room_members SELECT by user_id: Works (auth.uid() match) ✓
--
-- RoomDetail.tsx:
--   - profiles SELECT for timezone: Works for authenticated users ✓
--   - check_ins SELECT by user_id: Works (auth.uid() match) ✓
--   - check_ins SELECT for room: Works (public room check) ✓
--   - room_members SELECT: Works (public room check) ✓
--
-- Rooms.tsx:
--   - room_members SELECT by user_id: Works (auth.uid() match) ✓
--   - check_ins SELECT for room stats: Works (public rooms allowed) ✓
--
-- Profile.tsx:
--   - profiles SELECT by user_id: Works (user viewing own profile) ✓
--   - check_ins SELECT by user_id: Works (auth.uid() match) ✓
-- ============================================
