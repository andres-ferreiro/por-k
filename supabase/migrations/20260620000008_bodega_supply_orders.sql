-- Inter-branch bodega supply orders

create type public.supply_order_status as enum ('pending', 'confirmed', 'cancelled', 'delivered');

create table public.branch_supply_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  delivery_date date not null,
  status public.supply_order_status not null default 'pending',
  placed_by uuid not null references public.profiles(id) on delete restrict,
  placed_at timestamptz not null default now(),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (branch_id, delivery_date)
);

create index branch_supply_orders_delivery_date_idx
  on public.branch_supply_orders (delivery_date desc);

create index branch_supply_orders_branch_date_idx
  on public.branch_supply_orders (branch_id, delivery_date desc);

create table public.branch_supply_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.branch_supply_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index branch_supply_order_items_order_id_idx
  on public.branch_supply_order_items (order_id);

grant select, insert, update, delete on public.branch_supply_orders to authenticated;
grant all on public.branch_supply_orders to service_role;
grant select, insert, update, delete on public.branch_supply_order_items to authenticated;
grant all on public.branch_supply_order_items to service_role;

alter table public.branch_supply_orders enable row level security;
alter table public.branch_supply_order_items enable row level security;

-- branch_supply_orders RLS
create policy "Owners full access branch_supply_orders" on public.branch_supply_orders
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

create policy "Branch staff manage own supply orders" on public.branch_supply_orders
  for all to authenticated
  using (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  )
  with check (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  );

create policy "Bodega staff view all supply orders" on public.branch_supply_orders
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
    )
  );

create policy "Bodega staff update supply order status" on public.branch_supply_orders
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
    )
  );

-- branch_supply_order_items RLS
create policy "Owners full access branch_supply_order_items" on public.branch_supply_order_items
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

create policy "Branch staff manage own supply order items" on public.branch_supply_order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.branch_supply_orders o
      where o.id = branch_supply_order_items.order_id
        and o.branch_id = public.current_branch_id()
        and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
    )
  )
  with check (
    exists (
      select 1 from public.branch_supply_orders o
      where o.id = branch_supply_order_items.order_id
        and o.branch_id = public.current_branch_id()
        and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
    )
  );

create policy "Bodega staff view all supply order items" on public.branch_supply_order_items
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
    )
  );

create trigger branch_supply_orders_set_updated_at
  before update on public.branch_supply_orders
  for each row execute function public.set_updated_at();
