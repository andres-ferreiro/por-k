
-- Customers
CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  address text,
  lat numeric,
  lng numeric,
  photo_url text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_branch_id_idx ON public.customers(branch_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access customers" ON public.customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Branch members view customers" ON public.customers
  FOR SELECT TO authenticated
  USING (branch_id = current_branch_id());

CREATE POLICY "Supervisors insert customers in branch" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE POLICY "Supervisors update customers in branch" ON public.customers
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id())
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE POLICY "Supervisors delete customers in branch" ON public.customers
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Routes
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  name text NOT NULL,
  driver_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX routes_branch_id_idx ON public.routes(branch_id);
CREATE INDEX routes_driver_id_idx ON public.routes(driver_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.routes TO authenticated;
GRANT ALL ON public.routes TO service_role;
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access routes" ON public.routes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Branch members view routes" ON public.routes
  FOR SELECT TO authenticated
  USING (branch_id = current_branch_id());

CREATE POLICY "Drivers view own routes" ON public.routes
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

CREATE POLICY "Supervisors insert routes in branch" ON public.routes
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE POLICY "Supervisors update routes in branch" ON public.routes
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id())
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE POLICY "Supervisors delete routes in branch" ON public.routes
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());

CREATE TRIGGER routes_set_updated_at BEFORE UPDATE ON public.routes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Route customers (pivot)
CREATE TABLE public.route_customers (
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (route_id, customer_id),
  UNIQUE (route_id, position) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX route_customers_customer_id_idx ON public.route_customers(customer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.route_customers TO authenticated;
GRANT ALL ON public.route_customers TO service_role;
ALTER TABLE public.route_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access route_customers" ON public.route_customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Branch view route_customers" ON public.route_customers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND (r.branch_id = current_branch_id() OR r.driver_id = auth.uid())));

CREATE POLICY "Supervisors manage route_customers" ON public.route_customers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'supervisor'::app_role) AND EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.branch_id = current_branch_id()))
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND EXISTS (SELECT 1 FROM public.routes r WHERE r.id = route_id AND r.branch_id = current_branch_id()));
