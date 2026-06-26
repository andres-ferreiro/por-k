-- Bodega supply products share the products table with sales catalog items

alter table public.products
  add column if not exists is_bodega_supply boolean not null default false,
  add column if not exists bodega_category text;

create index products_bodega_supply_idx
  on public.products (is_bodega_supply, bodega_category, name)
  where is_bodega_supply = true;

create unique index products_bodega_name_category_idx
  on public.products (lower(name), lower(bodega_category))
  where is_bodega_supply = true and bodega_category is not null;

comment on column public.products.is_bodega_supply is
  'Supply/ingredient product for inter-branch bodega orders (not sold on routes).';
comment on column public.products.bodega_category is
  'Category grouping for bodega supply catalog (e.g. Panadería, Totopos).';
