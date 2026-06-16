ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS driver_location_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.branches.driver_location_enabled IS
  'When true, drivers can register and update customer GPS coordinates from their panel.';
