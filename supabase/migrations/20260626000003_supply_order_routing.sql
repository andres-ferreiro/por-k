-- Route supply orders to the fulfilling bodega branch

alter table public.branch_supply_orders
  drop constraint if exists branch_supply_orders_branch_id_delivery_date_key;

alter table public.branch_supply_orders
  add column if not exists bodega_id uuid references public.branches(id) on delete restrict;

create index if not exists branch_supply_orders_bodega_date_idx
  on public.branch_supply_orders (bodega_id, delivery_date desc);

-- Backfill existing orders to the first active bodega
do $$
declare
  default_bodega_id uuid;
begin
  select id into default_bodega_id
  from public.branches
  where is_bodega = true and is_active = true
  order by created_at
  limit 1;

  if default_bodega_id is not null then
    update public.branch_supply_orders
    set bodega_id = default_bodega_id
    where bodega_id is null;
  end if;
end $$;

alter table public.branch_supply_orders
  alter column bodega_id set not null;

alter table public.branch_supply_orders
  add constraint branch_supply_orders_branch_date_bodega_key
  unique (branch_id, delivery_date, bodega_id);

comment on column public.branch_supply_orders.bodega_id is
  'Bodega branch that fulfills this supply order.';
