-- Branch-side receipt acknowledgment for bodega supply orders

create type public.branch_receipt_status as enum ('received', 'incomplete');

alter table public.branch_supply_orders
  add column if not exists branch_receipt_status public.branch_receipt_status,
  add column if not exists branch_receipt_note text;

comment on column public.branch_supply_orders.branch_receipt_status is
  'Ordering branch acknowledgment: received or incomplete (independent from bodega status).';
comment on column public.branch_supply_orders.branch_receipt_note is
  'Optional note when branch marks order as incomplete.';

-- Branch staff can update receipt fields on their own orders
create policy "Branch staff set receipt status" on public.branch_supply_orders
  for update to authenticated
  using (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  )
  with check (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  );
