-- Partial payments + customer account ledger.
--
-- Design: the database keeps the books. Old app code (which only sends
-- payments.status) and new app code (which sends payments.amount_paid) both
-- keep working, because triggers keep status, amount_paid, the ledger and the
-- cached customers.pending_balance consistent.
--
-- Do NOT add BEGIN/COMMIT here: the migration runner wraps it in a transaction,
-- and the dry run relies on the whole script being one transaction.
--
-- Rollback notes: see /Users/andy/.cursor/plans/partial_payments_prod_safe.plan.md (section 7).

set local lock_timeout = '5s';   -- fail fast instead of queueing behind (and blocking) drivers

-- ---------------------------------------------------------------------------
-- 0. Preconditions
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'amount_paid'
  ) then
    raise exception 'Migration already applied: payments.amount_paid exists';
  end if;

  -- Rows without a delivery are treated as abonos (always fully paid).
  if exists (select 1 from public.payments where delivery_id is null and status <> 'paid') then
    raise exception 'Found unpaid payments without delivery_id; review before migrating';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Snapshots (no policies + no grants = not reachable through the API)
-- ---------------------------------------------------------------------------
create table public.backup_20261006_payments  as table public.payments;
create table public.backup_20261006_customers as table public.customers;
alter table public.backup_20261006_payments  enable row level security;
alter table public.backup_20261006_customers enable row level security;
revoke all on public.backup_20261006_payments  from anon, authenticated;
revoke all on public.backup_20261006_customers from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. New columns on payments
--    amount_paid: how much was received for this row (may exceed amount, the
--                 excess pays older debt). Filled by trigger when omitted.
--    is_abono:    row is a standalone payment (no sale attached).
-- ---------------------------------------------------------------------------
alter table public.payments add column amount_paid numeric(12,2);
alter table public.payments add column is_abono boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Ledger
--    amount > 0: customer owes more.  amount < 0: customer paid.
--    Append-only: no insert/update/delete policies; written by triggers and
--    SECURITY DEFINER functions only.
-- ---------------------------------------------------------------------------
create table public.customer_account_movements (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  payment_id  uuid,                                  -- no FK on purpose: keeps history if a payment is deleted
  kind        text not null check (kind in ('opening', 'sale', 'payment', 'adjustment')),
  amount      numeric(12,2) not null,
  method      public.payment_method,
  note        text,
  occurred_on date not null default ((now() at time zone 'America/Chihuahua')::date),
  created_by  uuid,
  created_at  timestamptz not null default now()
);

create index customer_account_movements_customer_idx
  on public.customer_account_movements (customer_id, created_at desc, id);
create index customer_account_movements_branch_idx
  on public.customer_account_movements (branch_id, created_at desc);
create index customer_account_movements_payment_idx
  on public.customer_account_movements (payment_id) where payment_id is not null;

alter table public.customer_account_movements enable row level security;
revoke all on public.customer_account_movements from anon, authenticated;
grant select on public.customer_account_movements to authenticated;

create policy "Owners view account movements"
  on public.customer_account_movements for select to authenticated
  using (public.has_role(auth.uid(), 'owner'));

create policy "Branch staff view account movements"
  on public.customer_account_movements for select to authenticated
  using (
    branch_id = public.current_branch_id()
    and (public.has_role(auth.uid(), 'cashier') or public.has_role(auth.uid(), 'supervisor'))
  );

create policy "Drivers view account movements of their customers"
  on public.customer_account_movements for select to authenticated
  using (
    exists (
      select 1
      from public.route_customers rc
      join public.routes r on r.id = rc.route_id
      where rc.customer_id = customer_account_movements.customer_id
        and r.driver_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Backfill payments (updated_at must not move)
-- ---------------------------------------------------------------------------
alter table public.payments disable trigger payments_set_updated_at;

update public.payments
set amount_paid = case when status = 'paid' then amount else 0 end,
    is_abono    = (delivery_id is null);

alter table public.payments enable trigger payments_set_updated_at;

alter table public.payments alter column amount_paid set not null;
alter table public.payments
  add constraint payments_amount_paid_check check (amount_paid >= 0);

-- ---------------------------------------------------------------------------
-- 5. BEFORE triggers: keep status / amount_paid consistent
--
--    Two kinds of writers:
--    * new code sends amount_paid ("explicit"): status is derived from it.
--    * old code sends only status: amount_paid follows status.
--
--    "UPDATE OF amount_paid" fires whenever amount_paid is in the SET list
--    (even if the value is unchanged), which is how an explicit write is
--    detected on UPDATE. Trigger names sort alphabetically: a_ runs before b_.
-- ---------------------------------------------------------------------------
create or replace function public.payments_flag_explicit_amount_paid()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform set_config('app.pay_explicit', '1', true);
  return new;
end;
$$;

create or replace function public.payments_sync_amount_paid()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  explicit boolean;
  ap numeric(12,2);
begin
  if tg_op = 'INSERT' then
    explicit := new.amount_paid is not null;
    new.is_abono := (new.delivery_id is null);
  else
    explicit := coalesce(current_setting('app.pay_explicit', true), '') = '1';
    perform set_config('app.pay_explicit', '', true);
    new.is_abono := old.is_abono;               -- immutable
  end if;

  -- Standalone payments are always fully paid.
  if new.is_abono then
    new.amount_paid := new.amount;
    new.status := 'paid';
    return new;
  end if;

  if explicit then
    ap := coalesce(new.amount_paid, 0);
  elsif tg_op = 'INSERT' then
    ap := case when new.status = 'paid' then new.amount else 0 end;
  elsif new.status is distinct from old.status or new.amount is distinct from old.amount then
    -- Old-style write that changed the status or the amount.
    if new.status = 'paid' then
      ap := new.amount;
    elsif old.status = 'paid' then
      ap := 0;
    else
      ap := old.amount_paid;                    -- stays pending: keep what was received
    end if;
  else
    ap := old.amount_paid;                      -- unrelated update (note, method, ...)
  end if;

  new.amount_paid := ap;
  new.status := case when ap >= new.amount then 'paid' else 'pending' end;
  return new;
end;
$$;

create trigger a_payments_flag_explicit_amount_paid
  before update of amount_paid on public.payments
  for each row execute function public.payments_flag_explicit_amount_paid();

create trigger b_payments_sync_amount_paid
  before insert or update on public.payments
  for each row execute function public.payments_sync_amount_paid();

-- ---------------------------------------------------------------------------
-- 6. AFTER trigger: write the difference into the ledger and the cache.
--    Never raises for accounting reasons: a driver's save must not fail.
--    Legacy rows (carried_over = true) are ignored: their debt is already
--    inside the opening balance.
-- ---------------------------------------------------------------------------
create or replace function public.payments_write_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o_charge numeric := 0;
  o_paid   numeric := 0;
  n_charge numeric := 0;
  n_paid   numeric := 0;
  d_charge numeric;
  d_paid   numeric;
  cust uuid;
  br uuid;
  pid uuid;
  mth public.payment_method;
  occ date;
begin
  -- Set by settle_customer_balance when it flips older rows to paid: the abono
  -- it inserted already paid them, so these flips must not hit the ledger again.
  if coalesce(current_setting('app.ledger_skip', true), '') = '1' then
    return null;
  end if;

  if tg_op in ('UPDATE', 'DELETE') and not old.carried_over then
    o_charge := case when old.is_abono then 0 else old.amount end;
    o_paid   := old.amount_paid;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and not new.carried_over then
    n_charge := case when new.is_abono then 0 else new.amount end;
    n_paid   := new.amount_paid;
  end if;

  d_charge := n_charge - o_charge;
  d_paid   := n_paid - o_paid;
  if d_charge = 0 and d_paid = 0 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    cust := old.customer_id; br := old.branch_id; pid := null; mth := old.method;
    occ := (now() at time zone 'America/Chihuahua')::date;
  else
    cust := new.customer_id; br := new.branch_id; pid := new.id; mth := new.method;
    occ := case when tg_op = 'INSERT'
                then (new.paid_at at time zone 'America/Chihuahua')::date
                else (now() at time zone 'America/Chihuahua')::date end;
  end if;

  perform set_config('app.ledger_write', '1', true);

  if d_charge <> 0 then
    insert into public.customer_account_movements
      (branch_id, customer_id, payment_id, kind, amount, occurred_on, created_by)
    values (br, cust, pid, 'sale', d_charge, occ, auth.uid());
  end if;
  if d_paid <> 0 then
    insert into public.customer_account_movements
      (branch_id, customer_id, payment_id, kind, amount, method, note, occurred_on, created_by)
    values (br, cust, pid, 'payment', -d_paid, mth,
            case when tg_op = 'INSERT' and new.is_abono then new.note else null end,
            occ, auth.uid());
  end if;

  update public.customers
  set pending_balance = pending_balance + (d_charge - d_paid)
  where id = cust;

  perform set_config('app.ledger_write', '', true);
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Guard: any direct change of customers.pending_balance that does not come
--    from the ledger is recorded as an adjustment (keeps the old admin
--    "Saldar" button consistent while old code is still deployed).
-- ---------------------------------------------------------------------------
create or replace function public.customers_guard_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pending_balance is distinct from old.pending_balance
     and coalesce(current_setting('app.ledger_write', true), '') <> '1' then
    insert into public.customer_account_movements
      (branch_id, customer_id, kind, amount, note, created_by)
    values (new.branch_id, new.id, 'adjustment',
            new.pending_balance - old.pending_balance,
            'Cambio directo del saldo', auth.uid());
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Opening balance: current balance + outstanding of sales not yet carried
--    over (they used to reach the balance only the next day).
-- ---------------------------------------------------------------------------
do $$
begin
  perform set_config('app.ledger_write', '1', true);

  create temp table _outstanding on commit drop as
    select customer_id, sum(amount - amount_paid) as outstanding
    from public.payments
    where status = 'pending' and carried_over = false and not is_abono
    group by customer_id;

  insert into public.customer_account_movements (branch_id, customer_id, kind, amount, note)
  select c.branch_id, c.id, 'opening',
         c.pending_balance + coalesce(o.outstanding, 0),
         'Saldo inicial al activar el estado de cuenta'
  from public.customers c
  left join _outstanding o on o.customer_id = c.id
  where c.pending_balance + coalesce(o.outstanding, 0) <> 0;

  update public.customers c
  set pending_balance = c.pending_balance + o.outstanding
  from _outstanding o
  where o.customer_id = c.id and o.outstanding <> 0;

  perform set_config('app.ledger_write', '', true);
end $$;

-- Triggers are created after the backfill and the opening balance on purpose.
create trigger z_payments_write_ledger
  after insert or update or delete on public.payments
  for each row execute function public.payments_write_ledger();

create trigger customers_guard_balance
  before update of pending_balance on public.customers
  for each row execute function public.customers_guard_balance();

-- Sales now reach the balance immediately; the nightly carry-over is obsolete.
-- Same signature, so already-deployed code that calls it keeps working.
create or replace function public.carry_over_pending_balance(p_branch_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  return;  -- deprecated: payments_write_ledger keeps customers.pending_balance current
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. Functions used by the new app code
-- ---------------------------------------------------------------------------
create or replace function public.register_customer_payment(
  p_customer_id uuid,
  p_amount numeric,
  p_method public.payment_method,
  p_note text default null
)
returns table (payment_id uuid, new_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.customers%rowtype;
  rid uuid;
  allowed boolean := false;
  pid uuid;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a 0';
  end if;
  if p_method not in ('cash', 'transfer', 'other') then
    raise exception 'Metodo de pago invalido';
  end if;

  select * into c from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Route used to attribute the payment (payments.route_id is NOT NULL).
  select r.id into rid
  from public.route_customers rc
  join public.routes r on r.id = rc.route_id
  where rc.customer_id = c.id and r.driver_id = uid and r.is_active
  order by r.created_at
  limit 1;

  if public.has_role(uid, 'owner') then
    allowed := true;
  elsif (public.has_role(uid, 'supervisor') or public.has_role(uid, 'cashier'))
        and c.branch_id = public.current_branch_id() then
    allowed := true;
  elsif public.has_role(uid, 'driver') and rid is not null then
    allowed := true;
  end if;
  if not allowed then
    raise exception 'No tienes permiso para registrar pagos de este cliente' using errcode = '42501';
  end if;

  if rid is null then
    select r.id into rid
    from public.route_customers rc
    join public.routes r on r.id = rc.route_id
    where rc.customer_id = c.id
    order by r.is_active desc, r.created_at
    limit 1;
  end if;
  if rid is null then
    select r.id into rid from public.routes r
    where r.branch_id = c.branch_id
    order by r.is_active desc, r.created_at
    limit 1;
  end if;
  if rid is null then
    raise exception 'No hay una ruta para atribuir el pago';
  end if;

  if round(p_amount, 2) > c.pending_balance then
    raise exception 'El abono (%) excede el saldo del cliente (%)', round(p_amount, 2), c.pending_balance;
  end if;

  insert into public.payments (branch_id, route_id, customer_id, driver_id, amount, status, method, note)
  values (c.branch_id, rid, c.id, uid, round(p_amount, 2), 'paid', p_method, nullif(trim(p_note), ''))
  returning id into pid;

  return query
    select pid, cu.pending_balance from public.customers cu where cu.id = c.id;
end;
$$;

create or replace function public.adjust_customer_balance(
  p_customer_id uuid,
  p_amount numeric,
  p_note text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.customers%rowtype;
  nb numeric;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'El ajuste no puede ser 0';
  end if;
  if p_note is null or length(trim(p_note)) < 3 then
    raise exception 'El ajuste requiere una nota';
  end if;

  select * into c from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  if not (
    public.has_role(uid, 'owner')
    or (public.has_role(uid, 'supervisor') and c.branch_id = public.current_branch_id())
  ) then
    raise exception 'No tienes permiso para ajustar saldos' using errcode = '42501';
  end if;

  nb := c.pending_balance + round(p_amount, 2);
  if nb < 0 then
    raise exception 'El saldo no puede quedar negativo';
  end if;

  perform set_config('app.ledger_write', '1', true);
  insert into public.customer_account_movements
    (branch_id, customer_id, kind, amount, note, created_by)
  values (c.branch_id, c.id, 'adjustment', round(p_amount, 2), trim(p_note), uid);
  update public.customers set pending_balance = nb where id = c.id;
  perform set_config('app.ledger_write', '', true);

  return nb;
end;
$$;

-- "Saldar": clears the customer's PREVIOUS balance (everything except the
-- outstanding of sales recorded today, which is what the old app meant by
-- "pending balance"). Used by the existing Saldar buttons so they keep working
-- with the ledger until the new statement UI exists.
--   p_method not null: records a real payment (driver collected money).
--   p_method null:     records an adjustment (administrative clear, no cash).
create or replace function public.settle_customer_balance(
  p_customer_id uuid,
  p_method public.payment_method default null,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  c public.customers%rowtype;
  rid uuid;
  allowed boolean := false;
  today date := (now() at time zone 'America/Chihuahua')::date;
  today_outstanding numeric;
  amt numeric;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;

  select * into c from public.customers where id = p_customer_id for update;
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  select r.id into rid
  from public.route_customers rc
  join public.routes r on r.id = rc.route_id
  where rc.customer_id = c.id and r.driver_id = uid and r.is_active
  order by r.created_at
  limit 1;

  if public.has_role(uid, 'owner') then
    allowed := true;
  elsif (public.has_role(uid, 'supervisor') or public.has_role(uid, 'cashier'))
        and c.branch_id = public.current_branch_id() then
    allowed := true;
  elsif public.has_role(uid, 'driver') and rid is not null then
    allowed := true;
  end if;
  if not allowed then
    raise exception 'No tienes permiso para saldar este cliente' using errcode = '42501';
  end if;

  select coalesce(sum(amount - amount_paid), 0) into today_outstanding
  from public.payments
  where customer_id = c.id
    and status = 'pending'
    and not is_abono
    and not carried_over
    and (paid_at at time zone 'America/Chihuahua')::date >= today;

  amt := round(c.pending_balance - today_outstanding, 2);
  if amt <= 0 then
    return 0;
  end if;

  if p_method is not null then
    if rid is null then
      select r.id into rid
      from public.route_customers rc
      join public.routes r on r.id = rc.route_id
      where rc.customer_id = c.id
      order by r.is_active desc, r.created_at
      limit 1;
    end if;
    if rid is null then
      select r.id into rid from public.routes r
      where r.branch_id = c.branch_id
      order by r.is_active desc, r.created_at
      limit 1;
    end if;
    if rid is null then
      raise exception 'No hay una ruta para atribuir el pago';
    end if;

    insert into public.payments (branch_id, route_id, customer_id, driver_id, amount, status, method, note)
    values (c.branch_id, rid, c.id, uid, amt, 'paid', p_method,
            coalesce(nullif(trim(p_note), ''), 'Saldo pendiente saldado'));
  else
    perform set_config('app.ledger_write', '1', true);
    insert into public.customer_account_movements
      (branch_id, customer_id, kind, amount, note, created_by)
    values (c.branch_id, c.id, 'adjustment', -amt,
            coalesce(nullif(trim(p_note), ''), 'Saldo saldado por administracion'), uid);
    update public.customers set pending_balance = pending_balance - amt where id = c.id;
    perform set_config('app.ledger_write', '', true);
  end if;

  -- Older unpaid sales are now covered: mark them paid without touching the
  -- ledger again (the abono / adjustment above already did).
  perform set_config('app.ledger_skip', '1', true);
  update public.payments
  set amount_paid = amount
  where customer_id = c.id
    and status = 'pending'
    and not is_abono
    and (carried_over or (paid_at at time zone 'America/Chihuahua')::date < today);
  perform set_config('app.ledger_skip', '', true);

  return amt;
end;
$$;

-- Daily check: customers whose cached balance differs from the ledger.
create or replace function public.account_reconciliation()
returns table (customer_id uuid, customer_name text, cached numeric, ledger numeric)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.pending_balance, coalesce(sum(m.amount), 0)
  from public.customers c
  left join public.customer_account_movements m on m.customer_id = c.id
  group by c.id
  having c.pending_balance <> coalesce(sum(m.amount), 0)
$$;

revoke all on function public.register_customer_payment(uuid, numeric, public.payment_method, text) from public, anon;
revoke all on function public.adjust_customer_balance(uuid, numeric, text) from public, anon;
revoke all on function public.settle_customer_balance(uuid, public.payment_method, text) from public, anon;
grant execute on function public.settle_customer_balance(uuid, public.payment_method, text) to authenticated;
revoke all on function public.account_reconciliation() from public, anon, authenticated;
grant execute on function public.register_customer_payment(uuid, numeric, public.payment_method, text) to authenticated;
grant execute on function public.adjust_customer_balance(uuid, numeric, text) to authenticated;
grant execute on function public.account_reconciliation() to service_role;

-- ---------------------------------------------------------------------------
-- 10. Self-check: any failure aborts and rolls back the whole migration
-- ---------------------------------------------------------------------------
do $$
declare
  n_before bigint;
  n_after bigint;
  expected_total numeric;
  actual_total numeric;
  bad bigint;
begin
  select count(*) into n_before from public.backup_20261006_payments;
  select count(*) into n_after from public.payments;
  if n_before <> n_after then
    raise exception 'Self-check: payments row count changed (% -> %)', n_before, n_after;
  end if;

  -- Old invariant: balances equal the carried-over pending payments.
  if (select coalesce(sum(pending_balance), 0) from public.backup_20261006_customers)
     <> (select coalesce(sum(amount), 0) from public.backup_20261006_payments
         where status = 'pending' and carried_over) then
    raise exception 'Self-check: old balances do not equal carried-over pending payments';
  end if;

  -- New total = old balances + sales not yet carried over.
  select (select coalesce(sum(pending_balance), 0) from public.backup_20261006_customers)
       + (select coalesce(sum(amount), 0) from public.backup_20261006_payments
          where status = 'pending' and not carried_over and delivery_id is not null)
    into expected_total;
  select coalesce(sum(pending_balance), 0) into actual_total from public.customers;
  if expected_total <> actual_total then
    raise exception 'Self-check: total balance % <> expected %', actual_total, expected_total;
  end if;

  select count(*) into bad from public.account_reconciliation();
  if bad > 0 then
    raise exception 'Self-check: % customers with ledger <> cached balance', bad;
  end if;

  if exists (select 1 from public.customers where pending_balance < 0) then
    raise exception 'Self-check: negative balance found';
  end if;

  if exists (select 1 from public.payments where amount_paid is null) then
    raise exception 'Self-check: NULL amount_paid';
  end if;

  select count(*) into bad
  from public.payments p
  join public.backup_20261006_payments b on b.id = p.id
  where p.updated_at is distinct from b.updated_at
     or p.amount is distinct from b.amount
     or p.status is distinct from b.status
     or p.method is distinct from b.method;
  if bad > 0 then
    raise exception 'Self-check: % payments changed unexpectedly', bad;
  end if;

  if (select coalesce(sum(amount_paid), 0) from public.payments)
     <> (select coalesce(sum(amount), 0) from public.backup_20261006_payments where status = 'paid') then
    raise exception 'Self-check: total amount_paid differs from total of paid payments';
  end if;
end $$;
