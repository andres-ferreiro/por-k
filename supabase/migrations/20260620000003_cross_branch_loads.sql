-- Cross-branch product loading for external drivers
create table if not exists public.cross_branch_loads (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null references public.branches(id) on delete cascade,
  driver_id       uuid not null references auth.users(id) on delete cascade,
  created_by      uuid references auth.users(id),
  notes           text,
  created_at      timestamptz not null default now()
);

create table if not exists public.cross_branch_load_items (
  id                   uuid primary key default gen_random_uuid(),
  cross_branch_load_id uuid not null references public.cross_branch_loads(id) on delete cascade,
  product_id           uuid not null references public.products(id) on delete cascade,
  quantity             numeric(12,2) not null check (quantity > 0),
  unique (cross_branch_load_id, product_id)
);

alter table public.cross_branch_loads enable row level security;
alter table public.cross_branch_load_items enable row level security;

-- Branch staff (owner/supervisor/cashier) can manage loads for their branch
create policy "cross_branch_loads_branch_staff"
  on public.cross_branch_loads
  for all
  using (branch_id = public.current_branch_id() or public.has_role(auth.uid(), 'owner'))
  with check (branch_id = public.current_branch_id() or public.has_role(auth.uid(), 'owner'));

-- The assigned driver can read their own loads
create policy "cross_branch_loads_driver_read"
  on public.cross_branch_loads
  for select
  using (driver_id = auth.uid());

-- Items follow parent
create policy "cross_branch_load_items_branch_staff"
  on public.cross_branch_load_items
  for all
  using (
    exists (
      select 1 from public.cross_branch_loads l
      where l.id = cross_branch_load_id
        and (l.branch_id = public.current_branch_id() or public.has_role(auth.uid(), 'owner'))
    )
  )
  with check (
    exists (
      select 1 from public.cross_branch_loads l
      where l.id = cross_branch_load_id
        and (l.branch_id = public.current_branch_id() or public.has_role(auth.uid(), 'owner'))
    )
  );

create policy "cross_branch_load_items_driver_read"
  on public.cross_branch_load_items
  for select
  using (
    exists (
      select 1 from public.cross_branch_loads l
      where l.id = cross_branch_load_id and l.driver_id = auth.uid()
    )
  );
