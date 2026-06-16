ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allow_returns boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.allow_returns IS
  'When true, drivers can register customer exchange returns for this product during visits.';
