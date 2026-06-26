-- Driver real-time location tracking
create table if not exists public.driver_locations (
  id          uuid primary key default gen_random_uuid(),
  driver_id   uuid not null references auth.users(id) on delete cascade,
  route_id    uuid references public.routes(id) on delete set null,
  lat         numeric(10,7) not null,
  lng         numeric(10,7) not null,
  accuracy    numeric(8,2),
  recorded_at timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

-- Only keep the latest entry per driver (we upsert on driver_id)
create unique index if not exists driver_locations_driver_id_key on public.driver_locations(driver_id);

alter table public.driver_locations enable row level security;

-- Drivers can upsert their own location
create policy "driver_locations_driver_upsert"
  on public.driver_locations
  for all
  using (driver_id = auth.uid())
  with check (driver_id = auth.uid());

-- Owners and supervisors can read all locations (scoped via app logic)
create policy "driver_locations_staff_read"
  on public.driver_locations
  for select
  using (
    public.has_role(auth.uid(), 'owner') or public.has_role(auth.uid(), 'supervisor')
  );
