-- Inter-bodega supply orders and scoped bodega staff RLS

alter table public.branch_supply_orders
  add column if not exists order_source text not null default 'branch'
  check (order_source in ('branch', 'bodega'));

comment on column public.branch_supply_orders.order_source is
  'branch = regular branch order; bodega = bodega ordering from another bodega.';

-- Replace broad bodega staff policies with bodega-scoped access
drop policy if exists "Bodega staff view all supply orders" on public.branch_supply_orders;
drop policy if exists "Bodega staff update supply order status" on public.branch_supply_orders;
drop policy if exists "Bodega staff view all supply order items" on public.branch_supply_order_items;

create policy "Bodega staff view scoped supply orders" on public.branch_supply_orders
  for select to authenticated
  using (
    exists (
      select 1
      from public.branches b
      join public.profiles p on p.id = auth.uid()
      where b.id = p.branch_id
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
        and (
          branch_supply_orders.bodega_id = b.id
          or (
            branch_supply_orders.order_source = 'bodega'
            and branch_supply_orders.branch_id = b.id
          )
        )
    )
  );

create policy "Bodega staff update scoped supply order status" on public.branch_supply_orders
  for update to authenticated
  using (
    exists (
      select 1
      from public.branches b
      join public.profiles p on p.id = auth.uid()
      where b.id = p.branch_id
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
        and branch_supply_orders.bodega_id = b.id
    )
  )
  with check (
    exists (
      select 1
      from public.branches b
      join public.profiles p on p.id = auth.uid()
      where b.id = p.branch_id
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
        and branch_supply_orders.bodega_id = b.id
    )
  );

create policy "Bodega staff manage own outgoing bodega orders" on public.branch_supply_orders
  for all to authenticated
  using (
    order_source = 'bodega'
    and branch_id = public.current_branch_id()
    and exists (
      select 1
      from public.branches b
      where b.id = public.current_branch_id()
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
    )
  )
  with check (
    order_source = 'bodega'
    and branch_id = public.current_branch_id()
    and exists (
      select 1
      from public.branches b
      where b.id = public.current_branch_id()
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
    )
  );

create policy "Bodega staff view scoped supply order items" on public.branch_supply_order_items
  for select to authenticated
  using (
    exists (
      select 1
      from public.branch_supply_orders o
      join public.branches b on b.id = (select p.branch_id from public.profiles p where p.id = auth.uid())
      where o.id = branch_supply_order_items.order_id
        and b.is_bodega = true
        and (
          public.has_role(auth.uid(), 'supervisor')
          or public.has_role(auth.uid(), 'cashier')
        )
        and (
          o.bodega_id = b.id
          or (o.order_source = 'bodega' and o.branch_id = b.id)
        )
    )
  );

create policy "Bodega staff manage own outgoing order items" on public.branch_supply_order_items
  for all to authenticated
  using (
    exists (
      select 1
      from public.branch_supply_orders o
      where o.id = branch_supply_order_items.order_id
        and o.order_source = 'bodega'
        and o.branch_id = public.current_branch_id()
        and exists (
          select 1 from public.branches b
          where b.id = public.current_branch_id()
            and b.is_bodega = true
            and (
              public.has_role(auth.uid(), 'supervisor')
              or public.has_role(auth.uid(), 'cashier')
            )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.branch_supply_orders o
      where o.id = branch_supply_order_items.order_id
        and o.order_source = 'bodega'
        and o.branch_id = public.current_branch_id()
        and exists (
          select 1 from public.branches b
          where b.id = public.current_branch_id()
            and b.is_bodega = true
            and (
              public.has_role(auth.uid(), 'supervisor')
              or public.has_role(auth.uid(), 'cashier')
            )
        )
    )
  );
