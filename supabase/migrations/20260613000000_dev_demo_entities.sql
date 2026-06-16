-- Tracks operational records created by the dev demo seeder (not core catalog data).
CREATE TABLE IF NOT EXISTS public.dev_demo_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL CHECK (table_name IN ('dispatches', 'deliveries', 'payments', 'expenses')),
  record_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, record_id)
);

CREATE INDEX dev_demo_entities_table_idx ON public.dev_demo_entities (table_name);

ALTER TABLE public.dev_demo_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage dev demo entities" ON public.dev_demo_entities
  TO authenticated
  USING (public.has_role(auth.uid(), 'owner'))
  WITH CHECK (public.has_role(auth.uid(), 'owner'));

GRANT SELECT, INSERT, DELETE ON public.dev_demo_entities TO authenticated;
GRANT ALL ON public.dev_demo_entities TO service_role;
