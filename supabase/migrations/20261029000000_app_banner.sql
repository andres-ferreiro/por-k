-- Single-row announcement banner shown at the top of the admin shell.
-- Reads: any signed-in user. Writes: none via the API (no write policies); the
-- `setAppBanner` server function writes with the service role after checking the caller's email.
-- Safe to re-run.

create table if not exists public.app_banner (
  id         boolean primary key default true check (id),
  message    text not null default '' check (char_length(message) <= 300),
  is_active  boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.app_banner (id) values (true) on conflict (id) do nothing;

alter table public.app_banner enable row level security;

-- Defense in depth: even if a write policy is added by mistake later, API roles cannot write.
-- Only the service role (used by the email-gated `setAppBanner` server function) can.
revoke insert, update, delete, truncate on public.app_banner from anon, authenticated;

drop policy if exists "app_banner_read" on public.app_banner;
create policy "app_banner_read"
  on public.app_banner
  for select
  to authenticated
  using (true);
