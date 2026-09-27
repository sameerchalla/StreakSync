--- ============================================
-- 006: Auto-generate room_code on room insert
-- ============================================

-- Verify existing rooms already have valid codes (backfilled by 005)
-- If any are NULL or empty, fix explicitly before trigger activates
UPDATE public.rooms
SET room_code = public.generate_room_code()
WHERE room_code IS NULL OR room_code = '';

-- Create trigger function that assigns code only when missing
CREATE OR REPLACE FUNCTION public.set_room_code_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.room_code IS NULL OR NEW.room_code = '' THEN
    NEW.room_code := public.generate_room_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop old trigger if exists, then create BEFORE INSERT trigger
DROP TRIGGER IF EXISTS trg_room_code_insert ON public.rooms;
CREATE TRIGGER trg_room_code_insert
BEFORE INSERT ON public.rooms
FOR EACH ROW
EXECUTE FUNCTION public.set_room_code_on_insert();
