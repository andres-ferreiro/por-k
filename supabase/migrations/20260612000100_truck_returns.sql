CREATE TABLE public.truck_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.dispatches(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL CHECK (quantity >= 0),
  returned_at timestamptz NOT NULL DEFAULT now(),
  returned_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_id, product_id)
);

CREATE INDEX truck_returns_dispatch_idx ON public.truck_returns (dispatch_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_returns TO authenticated;
GRANT ALL ON public.truck_returns TO service_role;

ALTER TABLE public.truck_returns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access truck_returns" ON public.truck_returns
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE POLICY "Truck returns follow dispatch access" ON public.truck_returns
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      WHERE d.id = dispatch_id
        AND (
          public.has_role(auth.uid(), 'owner')
          OR (
            d.branch_id = public.current_branch_id()
            AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dispatches d
      WHERE d.id = dispatch_id
        AND (
          public.has_role(auth.uid(), 'owner')
          OR (
            d.branch_id = public.current_branch_id()
            AND (public.has_role(auth.uid(), 'supervisor') OR public.has_role(auth.uid(), 'cashier'))
          )
        )
    )
  );
