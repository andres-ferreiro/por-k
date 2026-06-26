-- Pre-order routes for hotel/restaurant clients

create type public.customer_category as enum ('retail', 'hotel', 'restaurant');
create type public.route_mode as enum ('dispatch', 'preorder');
create type public.order_status as enum ('confirmed', 'delivered', 'failed', 'cancelled');

-- Branch feature gate
alter table public.branches
  add column if not exists preorder_enabled boolean not null default false,
  add column if not exists preorder_route_id uuid references public.routes(id) on delete set null;

-- Customer category
alter table public.customers
  add column if not exists category public.customer_category not null default 'retail';

-- Route mode
alter table public.routes
  add column if not exists route_mode public.route_mode not null default 'dispatch';

-- Customer orders
create table public.customer_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches(id) on delete cascade,
  route_id uuid not null references public.routes(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  delivery_date date not null,
  status public.order_status not null default 'confirmed',
  placed_by uuid references public.profiles(id) on delete set null,
  placed_at timestamptz not null default now(),
  delivery_id uuid references public.deliveries(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, delivery_date)
);

create index customer_orders_branch_date_idx on public.customer_orders (branch_id, delivery_date desc);
create index customer_orders_route_date_idx on public.customer_orders (route_id, delivery_date desc);
create index customer_orders_delivery_id_idx on public.customer_orders (delivery_id);

create table public.customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.customer_orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (order_id, product_id)
);

create index customer_order_items_order_id_idx on public.customer_order_items (order_id);

grant select, insert, update, delete on public.customer_orders to authenticated;
grant all on public.customer_orders to service_role;
grant select, insert, update, delete on public.customer_order_items to authenticated;
grant all on public.customer_order_items to service_role;

alter table public.customer_orders enable row level security;
alter table public.customer_order_items enable row level security;

-- RLS: customer_orders
create policy "Owners full access customer_orders" on public.customer_orders
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

create policy "Branch staff manage customer_orders" on public.customer_orders
  for all to authenticated
  using (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  )
  with check (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
  );

create policy "Drivers view own route orders" on public.customer_orders
  for select to authenticated
  using (
    exists (
      select 1 from public.routes r
      where r.id = customer_orders.route_id
        and r.driver_id = auth.uid()
    )
  );

-- RLS: customer_order_items
create policy "Owners full access customer_order_items" on public.customer_order_items
  for all to authenticated
  using (public.has_role(auth.uid(), 'owner'))
  with check (public.has_role(auth.uid(), 'owner'));

create policy "Branch staff manage customer_order_items" on public.customer_order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.customer_orders o
      where o.id = customer_order_items.order_id
        and o.branch_id = public.current_branch_id()
        and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
    )
  )
  with check (
    exists (
      select 1 from public.customer_orders o
      where o.id = customer_order_items.order_id
        and o.branch_id = public.current_branch_id()
        and (public.has_role(auth.uid(), 'supervisor') or public.has_role(auth.uid(), 'cashier'))
    )
  );

create policy "Drivers view own route order items" on public.customer_order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.customer_orders o
      join public.routes r on r.id = o.route_id
      where o.id = customer_order_items.order_id
        and r.driver_id = auth.uid()
    )
  );

create trigger customer_orders_set_updated_at
  before update on public.customer_orders
  for each row execute function public.set_updated_at();

-- Cashiers need insert/update on deliveries for order sync
create policy "Cashiers manage deliveries in branch" on public.deliveries
  for all to authenticated
  using (
    branch_id = public.current_branch_id()
    and public.has_role(auth.uid(), 'cashier')
  )
  with check (
    branch_id = public.current_branch_id()
    and public.has_role(auth.uid(), 'cashier')
  );

create policy "Cashiers manage delivery items in branch" on public.delivery_items
  for all to authenticated
  using (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_items.delivery_id
        and d.branch_id = public.current_branch_id()
        and public.has_role(auth.uid(), 'cashier')
    )
  )
  with check (
    exists (
      select 1 from public.deliveries d
      where d.id = delivery_items.delivery_id
        and d.branch_id = public.current_branch_id()
        and public.has_role(auth.uid(), 'cashier')
    )
  );
