
CREATE TABLE public.dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  dispatched_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispatches_branch_date_idx ON public.dispatches (branch_id, dispatched_at DESC);
CREATE INDEX dispatches_route_idx ON public.dispatches (route_id);
CREATE INDEX dispatches_driver_idx ON public.dispatches (driver_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatches TO authenticated;
GRANT ALL ON public.dispatches TO service_role;

ALTER TABLE public.dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access dispatches" ON public.dispatches
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Branch staff select dispatches" ON public.dispatches FOR SELECT
  TO authenticated
  USING (
    branch_id = public.current_branch_id()
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
  );

CREATE POLICY "Branch staff insert dispatches" ON public.dispatches FOR INSERT
  TO authenticated
  WITH CHECK (
    branch_id = public.current_branch_id()
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
  );

CREATE POLICY "Branch staff update dispatches" ON public.dispatches FOR UPDATE
  TO authenticated
  USING (
    branch_id = public.current_branch_id()
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
  )
  WITH CHECK (
    branch_id = public.current_branch_id()
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
  );

CREATE POLICY "Branch staff delete dispatches" ON public.dispatches FOR DELETE
  TO authenticated
  USING (
    branch_id = public.current_branch_id()
    AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
  );

CREATE POLICY "Drivers view own dispatches" ON public.dispatches FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

CREATE TRIGGER dispatches_set_updated_at
  BEFORE UPDATE ON public.dispatches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_id, product_id)
);
CREATE INDEX dispatch_items_dispatch_idx ON public.dispatch_items (dispatch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatch_items TO authenticated;
GRANT ALL ON public.dispatch_items TO service_role;

ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Items follow dispatch access" ON public.dispatch_items
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.dispatches d WHERE d.id = dispatch_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.dispatches d WHERE d.id = dispatch_id));

CREATE TRIGGER dispatch_items_set_updated_at
  BEFORE UPDATE ON public.dispatch_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
