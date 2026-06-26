-- Support multiple bodega branches with separate supply catalogs

drop index if exists public.branches_single_bodega_idx;

alter table public.branches
  add column if not exists bodega_display_name text;

comment on column public.branches.bodega_display_name is
  'Optional display label for bodega branches (e.g. Bodega Panadería).';

alter table public.products
  add column if not exists bodega_id uuid references public.branches(id) on delete restrict;

create index if not exists products_bodega_id_idx
  on public.products (bodega_id)
  where is_bodega_supply = true and bodega_id is not null;

-- Product names are unique per bodega (not globally)
drop index if exists public.products_bodega_name_category_idx;

create unique index products_bodega_name_category_bodega_idx
  on public.products (bodega_id, lower(name), lower(bodega_category))
  where is_bodega_supply = true and bodega_category is not null and bodega_id is not null;

comment on column public.products.bodega_id is
  'Source bodega branch for supply products. Required for bodega supply items.';

-- Backfill existing supply products to the first active bodega branch
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
    update public.products
    set bodega_id = default_bodega_id
    where is_bodega_supply = true and bodega_id is null;

    update public.branches
    set bodega_display_name = coalesce(bodega_display_name, name)
    where id = default_bodega_id;
  end if;
end $$;
