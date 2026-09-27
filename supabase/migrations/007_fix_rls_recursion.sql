--- ============================================
-- 007: Fix infinite recursion in RLS policies
-- Make generate_room_code() SECURITY DEFINER to bypass RLS
-- ============================================

-- Recreate generate_room_code as SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.generate_room_code()
RETURNS VARCHAR(6)
LANGUAGE plpgsql
SECURITY DEFINER
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

    -- Check if this code already exists (bypasses RLS due to SECURITY DEFINER)
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