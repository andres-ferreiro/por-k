-- Custom sort order for products on the driver delivery panel.
ALTER TABLE public.products
  ADD COLUMN display_order integer NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY name) - 1 AS pos
  FROM public.products
)
UPDATE public.products p
SET display_order = ranked.pos
FROM ranked
WHERE p.id = ranked.id;

CREATE INDEX products_display_order_idx ON public.products(display_order);
