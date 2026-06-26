-- Transfer driver RLS policies (separate migration: enum value must commit first)

create policy "Transfer drivers view supply orders" on public.branch_supply_orders
  for select to authenticated
  using (public.has_role(auth.uid(), 'transfer_driver'));

create policy "Transfer drivers update supply order status" on public.branch_supply_orders
  for update to authenticated
  using (public.has_role(auth.uid(), 'transfer_driver'))
  with check (public.has_role(auth.uid(), 'transfer_driver'));

create policy "Transfer drivers view supply order items" on public.branch_supply_order_items
  for select to authenticated
  using (public.has_role(auth.uid(), 'transfer_driver'));
