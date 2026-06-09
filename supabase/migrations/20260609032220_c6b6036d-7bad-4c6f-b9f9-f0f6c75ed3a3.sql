
-- 1. price on products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS price numeric(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0);

-- 2. customer_prices
CREATE TABLE IF NOT EXISTS public.customer_prices (
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  price       numeric(12,2) NOT NULL CHECK (price >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_prices TO authenticated;
GRANT ALL ON public.customer_prices TO service_role;

ALTER TABLE public.customer_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Branch staff read customer prices" ON public.customer_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_prices.customer_id
        AND c.branch_id = public.current_branch_id()
    )
    OR public.has_role(auth.uid(), 'owner')
  );

CREATE POLICY "Driver read customer prices for their route customers" ON public.customer_prices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.route_customers rc
      JOIN public.routes r ON r.id = rc.route_id
      WHERE rc.customer_id = customer_prices.customer_id
        AND r.driver_id = auth.uid()
    )
  );

CREATE POLICY "Owners manage customer prices" ON public.customer_prices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Supervisors manage customer prices in branch" ON public.customer_prices
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'supervisor')
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_prices.customer_id
        AND c.branch_id = public.current_branch_id()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'supervisor')
    AND EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = customer_prices.customer_id
        AND c.branch_id = public.current_branch_id()
    )
  );

CREATE TRIGGER customer_prices_set_updated_at
  BEFORE UPDATE ON public.customer_prices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. delivery_items
CREATE TABLE IF NOT EXISTS public.delivery_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity     numeric NOT NULL CHECK (quantity > 0),
  unit_price   numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  line_total   numeric(14,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, product_id)
);

CREATE INDEX IF NOT EXISTS delivery_items_delivery_idx ON public.delivery_items(delivery_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_items TO authenticated;
GRANT ALL ON public.delivery_items TO service_role;

ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver manage own delivery items" ON public.delivery_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_items.delivery_id AND d.driver_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_items.delivery_id AND d.driver_id = auth.uid())
  );

CREATE POLICY "Branch staff read delivery items" ON public.delivery_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_items.delivery_id
        AND d.branch_id = public.current_branch_id()
        AND (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'supervisor'))
    )
  );

CREATE POLICY "Owners full access delivery items" ON public.delivery_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER delivery_items_set_updated_at
  BEFORE UPDATE ON public.delivery_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. delivery_returns
CREATE TABLE IF NOT EXISTS public.delivery_returns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  uuid NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity     numeric NOT NULL CHECK (quantity > 0),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, product_id)
);

CREATE INDEX IF NOT EXISTS delivery_returns_delivery_idx ON public.delivery_returns(delivery_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_returns TO authenticated;
GRANT ALL ON public.delivery_returns TO service_role;

ALTER TABLE public.delivery_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver manage own delivery returns" ON public.delivery_returns
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_returns.delivery_id AND d.driver_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.deliveries d
            WHERE d.id = delivery_returns.delivery_id AND d.driver_id = auth.uid())
  );

CREATE POLICY "Branch staff read delivery returns" ON public.delivery_returns
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deliveries d
      WHERE d.id = delivery_returns.delivery_id
        AND d.branch_id = public.current_branch_id()
        AND (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'supervisor'))
    )
  );

CREATE POLICY "Owners full access delivery returns" ON public.delivery_returns
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER delivery_returns_set_updated_at
  BEFORE UPDATE ON public.delivery_returns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. payments.delivery_id
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS delivery_id uuid REFERENCES public.deliveries(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS payments_delivery_id_unique
  ON public.payments(delivery_id) WHERE delivery_id IS NOT NULL;

-- 6. price resolver
CREATE OR REPLACE FUNCTION public.get_price_for(_customer_id uuid, _product_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT price FROM public.customer_prices
       WHERE customer_id = _customer_id AND product_id = _product_id),
    (SELECT price FROM public.products WHERE id = _product_id),
    0
  );
$$;
