-- Transfer driver role for inter-bodega / branch supply logistics
-- Note: enum value must be committed before use in policies (Postgres limitation)

alter type public.app_role add value if not exists 'transfer_driver';
