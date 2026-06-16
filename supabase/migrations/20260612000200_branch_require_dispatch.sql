ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS require_dispatch_before_route boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.branches.require_dispatch_before_route IS
  'When true, drivers cannot use their panel until today dispatch is registered for their route.';
