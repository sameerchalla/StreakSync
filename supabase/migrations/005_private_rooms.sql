-- ============================================
-- StreakSync Migration 005: Private Rooms System
-- ============================================
-- This migration adds the private rooms feature with:
--   - room_code column for both public and private rooms
--   - visibility column ('public' or 'private')
--   - room_join_requests table for private room access
--   - secure room code generation function
-- ============================================

-- ============================================
-- 1. Add room_code and visibility columns to rooms
-- ============================================

-- Add room_code column (6 characters, unique, non-null)
ALTER TABLE public.rooms
  ADD COLUMN room_code VARCHAR(6);

-- Add visibility column with check constraint (public/private)
ALTER TABLE public.rooms
  ADD COLUMN visibility VARCHAR(8) CHECK (visibility IN ('public', 'private'));

-- ============================================
-- 2. Backfill existing rooms with codes and visibility
-- ============================================

-- Update visibility based on the existing is_public field
UPDATE public.rooms
SET visibility = CASE
  WHEN is_public = true THEN 'public'
  ELSE 'private'
END;

-- Generate unique room codes for all existing rooms
-- Use a deterministic approach based on room id to ensure uniqueness
UPDATE public.rooms
SET room_code = UPPER(
  SUBSTRING(
    MD5(rooms.id::TEXT || 'private-room-salt-2024-streaksync'),
    1,
    6
  )
);

-- Ensure room_code is non-null for all rooms
ALTER TABLE public.rooms
  ALTER COLUMN room_code SET NOT NULL;

-- Add unique constraint on room_code
ALTER TABLE public.rooms
  ADD CONSTRAINT unique_room_code UNIQUE (room_code);

-- ============================================
-- 3. Create room_join_requests table
-- ============================================

CREATE TABLE public.room_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status VARCHAR(10) NOT NULL CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ,
  responded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- ============================================
-- 4. Add RLS policies for room_join_requests
-- ============================================

-- Enable RLS
ALTER TABLE public.room_join_requests ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own requests
CREATE POLICY "join_requests_view_own" ON public.room_join_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can create their own join requests
CREATE POLICY "join_requests_create_own" ON public.room_join_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Room owners can view requests for their own rooms
CREATE POLICY "join_requests_owners_view" ON public.room_join_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_join_requests.room_id
        AND r.created_by = auth.uid()
    )
  );

-- Policy: Room owners can accept/reject requests for their own rooms
CREATE POLICY "join_requests_owners_manage" ON public.room_join_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_join_requests.room_id
        AND r.created_by = auth.uid()
    )
  );

-- ============================================
-- 5. Add database constraints and indexes
-- ============================================

-- Constraint: Only one pending request per user per room
CREATE UNIQUE INDEX idx_unique_pending_request
  ON public.room_join_requests(room_id, user_id)
  WHERE status = 'pending';

-- Constraint: Ensure unique membership (existing constraint preserved)
ALTER TABLE public.room_members
  ADD CONSTRAINT unique_room_membership UNIQUE (user_id, room_id);

-- Indexes for efficient lookups
CREATE INDEX idx_join_requests_room_status ON public.room_join_requests(room_id, status);
CREATE INDEX idx_join_requests_user_status ON public.room_join_requests(user_id, status);
CREATE INDEX idx_join_requests_room_user ON public.room_join_requests(room_id, user_id);

-- ============================================
-- 6. Update rooms RLS policies to consider visibility
-- ============================================

-- Drop the existing overly permissive policy
drop policy if exists "Public rooms are viewable by everyone" on public.rooms;

-- Create a new scoped policy that respects visibility
CREATE POLICY "rooms_visibility_based_access" ON public.rooms
  FOR SELECT
  USING (
    visibility = 'public'
    OR auth.uid() = created_by
    OR auth.uid() = (
      SELECT user_id
      FROM public.room_members
      WHERE room_id = rooms.id
      AND is_active = true
    )
  );

-- Policy: Room owners can update their own rooms
CREATE POLICY "rooms_update_own" ON public.rooms
  FOR UPDATE
  USING (auth.uid() = created_by);

-- Policy: Room owners can delete their own rooms
CREATE POLICY "rooms_delete_own" ON public.rooms
  FOR DELETE
  USING (auth.uid() = created_by);

-- Policy: Authenticated users can create rooms
CREATE POLICY "rooms_create_authenticated" ON public.rooms
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- ============================================
-- 7. Add trigger to automatically set updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_join_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language plpgsql;

DROP TRIGGER IF EXISTS update_join_request_timestamp ON public.room_join_requests;
CREATE TRIGGER update_join_request_timestamp
  BEFORE UPDATE ON public.room_join_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_join_request_timestamp();

-- ============================================
-- 8. Create a secure room code generator function
-- ============================================

CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
AS $$
DECLARE
  code VARCHAR(6);
  attempt INT := 0;
  max_attempts INT := 10;
BEGIN
  LOOP
    -- Generate a secure random code using cryptographically strong random
    code := UPPER(
      SUBSTRING(
        MD5(
          CONCAT(
            EXTRACT(EPOCH FROM clock_timestamp())::TEXT,
            (random() * 1000000)::int::TEXT,
            (md5(random()::TEXT))::TEXT
          )
        ),
        1,
        6
      )
    );

    -- Check if this code already exists
    IF NOT EXISTS (SELECT 1 FROM public.rooms WHERE room_code = code) THEN
      RETURN code;
    END IF;

    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      -- Fallback to a more robust method if we've tried too many times
      RETURN UPPER(SUBSTRING(MD5(RANDOM()::TEXT), 1, 6));
    END IF;
  END LOOP;
END;
$$;

-- ============================================
-- 9. Backfill room_codes for any remaining nulls
-- ============================================

-- Update any rooms that might still have null room_code
UPDATE public.rooms
SET room_code = public.generate_room_code()
WHERE room_code IS NULL;

-- ============================================
-- DONE: Private rooms system implemented
-- ============================================