-- Mark one branch as the central bodega (supply warehouse)

alter table public.branches
  add column if not exists is_bodega boolean not null default false;

create unique index branches_single_bodega_idx
  on public.branches ((true))
  where is_bodega = true;

comment on column public.branches.is_bodega is
  'When true, this branch receives supply orders from other branches.';
