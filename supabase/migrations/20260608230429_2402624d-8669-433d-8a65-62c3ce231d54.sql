
-- Enums
CREATE TYPE public.delivery_status AS ENUM ('pending', 'delivered', 'failed');
CREATE TYPE public.payment_status AS ENUM ('paid', 'pending');
CREATE TYPE public.payment_method AS ENUM ('cash', 'transfer', 'credit', 'other');

-- Deliveries
CREATE TABLE public.deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  delivery_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  status public.delivery_status NOT NULL DEFAULT 'pending',
  comment text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, customer_id, delivery_date)
);
CREATE INDEX deliveries_driver_date_idx ON public.deliveries (driver_id, delivery_date DESC);
CREATE INDEX deliveries_branch_date_idx ON public.deliveries (branch_id, delivery_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deliveries TO authenticated;
GRANT ALL ON public.deliveries TO service_role;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver manage own deliveries" ON public.deliveries
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Branch staff view deliveries" ON public.deliveries
  FOR SELECT TO authenticated
  USING (branch_id = public.current_branch_id() AND (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Owners full access deliveries" ON public.deliveries
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER deliveries_set_updated_at BEFORE UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Payments
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  status public.payment_status NOT NULL DEFAULT 'paid',
  method public.payment_method NOT NULL DEFAULT 'cash',
  note text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_driver_paid_idx ON public.payments (driver_id, paid_at DESC);
CREATE INDEX payments_branch_paid_idx ON public.payments (branch_id, paid_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver manage own payments" ON public.payments
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Branch staff view payments" ON public.payments
  FOR SELECT TO authenticated
  USING (branch_id = public.current_branch_id() AND (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Owners full access payments" ON public.payments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER payments_set_updated_at BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Expenses
CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  route_id uuid REFERENCES public.routes(id) ON DELETE SET NULL,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  description text NOT NULL,
  photo_url text,
  expense_date date NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX expenses_driver_date_idx ON public.expenses (driver_id, expense_date DESC);
CREATE INDEX expenses_branch_date_idx ON public.expenses (branch_id, expense_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Driver manage own expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

CREATE POLICY "Branch staff view expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (branch_id = public.current_branch_id() AND (public.has_role(auth.uid(), 'cashier') OR public.has_role(auth.uid(), 'supervisor')));

CREATE POLICY "Owners full access expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

CREATE TRIGGER expenses_set_updated_at BEFORE UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
