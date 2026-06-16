-- Track CSV bulk imports so routes can add customers in original file order.
CREATE TABLE public.customer_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  label text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customer_import_batches_branch_id_idx ON public.customer_import_batches(branch_id);
CREATE INDEX customer_import_batches_created_at_idx ON public.customer_import_batches(created_at DESC);

ALTER TABLE public.customers
  ADD COLUMN import_batch_id uuid REFERENCES public.customer_import_batches(id) ON DELETE SET NULL,
  ADD COLUMN import_position integer;

CREATE INDEX customers_import_batch_id_idx ON public.customers(import_batch_id);

GRANT SELECT, INSERT ON public.customer_import_batches TO authenticated;
GRANT ALL ON public.customer_import_batches TO service_role;
ALTER TABLE public.customer_import_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners full access import batches" ON public.customer_import_batches
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'owner'::app_role));

CREATE POLICY "Branch members view import batches" ON public.customer_import_batches
  FOR SELECT TO authenticated
  USING (branch_id = current_branch_id());

CREATE POLICY "Supervisors insert import batches in branch" ON public.customer_import_batches
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'supervisor'::app_role) AND branch_id = current_branch_id());
