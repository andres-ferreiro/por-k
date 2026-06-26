-- Per-item receipt and driver correction tracking for incomplete bodega deliveries

create type public.supply_correction_status as enum ('pending', 'delivered');

alter table public.branch_supply_order_items
  add column if not exists received_quantity numeric check (received_quantity >= 0),
  add column if not exists correction_quantity numeric check (correction_quantity >= 0);

alter table public.branch_supply_orders
  add column if not exists correction_status public.supply_correction_status,
  add column if not exists correction_delivered_at timestamptz;

comment on column public.branch_supply_order_items.received_quantity is
  'Qty the ordering branch actually received when marking the order incomplete.';
comment on column public.branch_supply_order_items.correction_quantity is
  'Qty the transfer driver delivered as a correction for the reported shortage.';
comment on column public.branch_supply_orders.correction_status is
  'Set to pending when branch reports shortages; delivered after driver brings missing items.';

create policy "Transfer drivers update supply order items" on public.branch_supply_order_items
  for update to authenticated
  using (public.has_role(auth.uid(), 'transfer_driver'))
  with check (public.has_role(auth.uid(), 'transfer_driver'));
