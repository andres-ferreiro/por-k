-- Add failure reason and photo to deliveries for closed-store feature
do $$ begin
  if not exists (select 1 from pg_type where typname = 'delivery_failure_reason') then
    create type public.delivery_failure_reason as enum ('closed', 'no_order', 'other');
  end if;
end $$;

alter table public.deliveries
  add column if not exists failure_reason public.delivery_failure_reason,
  add column if not exists failure_photo_url text;
