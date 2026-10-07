-- Behavior tests for 20261007000000_partial_payments_ledger.sql
--
-- NOT a migration (lives outside supabase/migrations on purpose).
-- Run it right after the migration text, in the SAME transaction / query string.
-- It always ends by raising an exception, so everything (migration included)
-- is rolled back:
--   * message starts with DRYRUN_OK   -> every check passed
--   * message starts with FAIL        -> the named check failed
-- It creates a test customer and test payments only; real rows are not touched.

do $test$
declare
  b uuid; r uuid; d uuid; o uuid;
  cid uuid;
  dl1 uuid; dl2 uuid; dl3 uuid; dl4 uuid;
  pa uuid; pb uuid; pc uuid; pd uuid; pab uuid;
  bal numeric; ap numeric; st text; n int;
  others_total numeric; all_total numeric; opening_rows int;
  raised boolean;
  checks int := 0;
begin
  -- Fixtures taken from real rows
  select id, driver_id, branch_id into r, d, b
  from public.routes where driver_id is not null and is_active limit 1;
  select user_id into o from public.user_roles where role = 'owner' limit 1;
  if r is null or o is null then raise exception 'FAIL setup: no active route or no owner'; end if;
  if not exists (select 1 from public.profiles where id = o) then
    raise exception 'FAIL setup: owner has no profile row (payments.driver_id FK)';
  end if;

  select coalesce(sum(pending_balance), 0), count(*) into others_total, n from public.customers;
  select count(*) into opening_rows from public.customer_account_movements where kind = 'opening';
  all_total := others_total;

  insert into public.customers (branch_id, name) values (b, 'ZZ-PRUEBA-DRYRUN') returning id into cid;
  insert into public.route_customers (route_id, customer_id, position) values (r, cid, 9999);

  insert into public.deliveries (branch_id, route_id, customer_id, driver_id, delivery_date, status)
    values (b, r, cid, d, current_date - 200, 'delivered') returning id into dl1;
  insert into public.deliveries (branch_id, route_id, customer_id, driver_id, delivery_date, status)
    values (b, r, cid, d, current_date - 201, 'delivered') returning id into dl2;
  insert into public.deliveries (branch_id, route_id, customer_id, driver_id, delivery_date, status)
    values (b, r, cid, d, current_date - 202, 'delivered') returning id into dl3;
  insert into public.deliveries (branch_id, route_id, customer_id, driver_id, delivery_date, status)
    values (b, r, cid, d, current_date - 203, 'delivered') returning id into dl4;

  -- T1: old-style insert (status only), pending sale of 100
  insert into public.payments (branch_id, route_id, customer_id, driver_id, delivery_id, amount, method, status)
    values (b, r, cid, d, dl1, 100, 'credit', 'pending') returning id into pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 0 and st = 'pending' and bal = 100) then
    raise exception 'FAIL T1 old insert pending: ap=% st=% bal=%', ap, st, bal;
  end if;
  select count(*) into n from public.customer_account_movements where customer_id = cid and kind = 'sale' and amount = 100;
  checks := checks + 1;
  if n <> 1 then raise exception 'FAIL T1 sale movement count=%', n; end if;

  -- T2: old-style update status -> paid
  update public.payments set status = 'paid' where id = pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 100 and st = 'paid' and bal = 0) then
    raise exception 'FAIL T2 old paid: ap=% st=% bal=%', ap, st, bal;
  end if;

  -- T3: old-style update back to pending
  update public.payments set status = 'pending' where id = pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 0 and st = 'pending' and bal = 100) then
    raise exception 'FAIL T3 old back to pending: ap=% st=% bal=%', ap, st, bal;
  end if;

  -- T4: new-style partial: received 40
  update public.payments set amount_paid = 40, status = 'pending' where id = pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 40 and st = 'pending' and bal = 60) then
    raise exception 'FAIL T4 partial: ap=% st=% bal=%', ap, st, bal;
  end if;

  -- T5: new-style, inconsistent status must be derived from amount_paid
  update public.payments set amount_paid = 100, status = 'pending' where id = pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 100 and st = 'paid' and bal = 0) then
    raise exception 'FAIL T5 derived status: ap=% st=% bal=%', ap, st, bal;
  end if;

  -- T6: second sale of 50 pending, then excess received on the first one (130 for a 100 sale)
  insert into public.payments (branch_id, route_id, customer_id, driver_id, delivery_id, amount, method, status)
    values (b, r, cid, d, dl2, 50, 'credit', 'pending') returning id into pb;
  update public.payments set amount_paid = 130, status = 'paid' where id = pa;
  select amount_paid into ap from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 130 and bal = 20) then
    raise exception 'FAIL T6 excess pays old debt: ap=% bal=% (expected 130 / 20)', ap, bal;
  end if;

  -- T7: old-style amount change on a paid sale (100 -> 120, status paid)
  update public.payments set amount = 120, status = 'paid' where id = pa;
  select amount_paid, status::text into ap, st from public.payments where id = pa;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if not (ap = 120 and st = 'paid' and bal = 50) then
    raise exception 'FAIL T7 old amount edit: ap=% st=% bal=% (expected 120 paid 50)', ap, st, bal;
  end if;

  -- T8: unrelated update keeps amount_paid and writes nothing to the ledger
  select count(*) into n from public.customer_account_movements where customer_id = cid;
  update public.payments set note = 'nota de prueba' where id = pa;
  select amount_paid into ap from public.payments where id = pa;
  checks := checks + 1;
  if ap <> 120 then raise exception 'FAIL T8 note update changed amount_paid: %', ap; end if;
  checks := checks + 1;
  if (select count(*) from public.customer_account_movements where customer_id = cid) <> n then
    raise exception 'FAIL T8 note update wrote ledger rows';
  end if;

  -- T9: driver registers an abono of 20 through the function
  perform set_config('request.jwt.claims', json_build_object('sub', d::text, 'role', 'authenticated')::text, true);
  select ra.payment_id, ra.new_balance into pab, bal from public.register_customer_payment(cid, 20, 'cash', 'abono prueba') ra;
  checks := checks + 1;
  if bal <> 30 then raise exception 'FAIL T9 abono balance=% (expected 30)', bal; end if;
  select is_abono, status::text, amount_paid into raised, st, ap from public.payments where id = pab;
  checks := checks + 1;
  if not (raised and st = 'paid' and ap = 20) then
    raise exception 'FAIL T9 abono row: is_abono=% st=% ap=%', raised, st, ap;
  end if;

  -- T10: abono above the balance is rejected
  raised := false;
  begin
    perform public.register_customer_payment(cid, 999999, 'cash', 'x');
  exception when others then
    raised := true;
  end;
  checks := checks + 1;
  if not raised then raise exception 'FAIL T10 oversized abono was accepted'; end if;

  -- T11: owner registers an abono of 10
  perform set_config('request.jwt.claims', json_build_object('sub', o::text, 'role', 'authenticated')::text, true);
  select ra.new_balance into bal from public.register_customer_payment(cid, 10, 'transfer', null) ra;
  checks := checks + 1;
  if bal <> 20 then raise exception 'FAIL T11 owner abono balance=% (expected 20)', bal; end if;

  -- T12: older debt, then "Saldar" as driver (old Saldar semantics: clears everything except today's sales)
  perform set_config('request.jwt.claims', json_build_object('sub', d::text, 'role', 'authenticated')::text, true);
  insert into public.payments (branch_id, route_id, customer_id, driver_id, delivery_id, amount, method, status, paid_at)
    values (b, r, cid, d, dl3, 70, 'credit', 'pending', now() - interval '5 days') returning id into pc;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if bal <> 90 then raise exception 'FAIL T12 setup balance=% (expected 90)', bal; end if;
  select public.settle_customer_balance(cid, 'cash', null) into bal;
  checks := checks + 1;
  if bal <> 40 then raise exception 'FAIL T12 settle amount=% (expected 40)', bal; end if;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if bal <> 50 then raise exception 'FAIL T12 balance after settle=% (expected 50 = today''s sale B)', bal; end if;
  select status::text, amount_paid into st, ap from public.payments where id = pc;
  checks := checks + 1;
  if not (st = 'paid' and ap = 70) then raise exception 'FAIL T12 older row not flipped: st=% ap=%', st, ap; end if;
  select status::text into st from public.payments where id = pb;
  checks := checks + 1;
  if st <> 'pending' then raise exception 'FAIL T12 today''s sale was flipped: %', st; end if;

  -- T13: administrative settle with nothing old to clear returns 0
  perform set_config('request.jwt.claims', json_build_object('sub', o::text, 'role', 'authenticated')::text, true);
  select public.settle_customer_balance(cid, null, null) into bal;
  checks := checks + 1;
  if bal <> 0 then raise exception 'FAIL T13 admin settle returned %', bal; end if;

  -- T14: direct write to pending_balance (old admin code) becomes an adjustment
  update public.customers set pending_balance = pending_balance + 5 where id = cid;
  select count(*) into n from public.customer_account_movements where customer_id = cid and kind = 'adjustment' and amount = 5;
  checks := checks + 1;
  if n <> 1 then raise exception 'FAIL T14 direct balance write produced % adjustment rows', n; end if;

  -- T15: adjust function requires a note and works for the owner
  raised := false;
  begin
    perform public.adjust_customer_balance(cid, -5, '');
  exception when others then
    raised := true;
  end;
  checks := checks + 1;
  if not raised then raise exception 'FAIL T15 adjustment without note accepted'; end if;
  select public.adjust_customer_balance(cid, -5, 'ajuste de prueba') into bal;
  checks := checks + 1;
  if bal <> 50 then raise exception 'FAIL T15 balance after adjust=% (expected 50)', bal; end if;

  -- T16: a driver of another branch / no route cannot register payments (permission check)
  raised := false;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text, 'role', 'authenticated')::text, true);
    perform public.register_customer_payment(cid, 1, 'cash', null);
  exception when others then
    raised := true;
  end;
  checks := checks + 1;
  if not raised then raise exception 'FAIL T16 unknown user could register a payment'; end if;

  -- T17: deleting a sale reverses its charge
  delete from public.payments where id = pb;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if bal <> 0 then raise exception 'FAIL T17 balance after deleting sale=% (expected 0)', bal; end if;

  -- T18: legacy (carried_over) rows are ignored by the ledger, also when flipped to paid
  insert into public.payments (branch_id, route_id, customer_id, driver_id, delivery_id, amount, method, status, carried_over)
    values (b, r, cid, d, dl4, 70, 'credit', 'pending', true) returning id into pd;
  update public.payments set status = 'paid' where id = pd;
  select pending_balance into bal from public.customers where id = cid;
  checks := checks + 1;
  if bal <> 0 then raise exception 'FAIL T18 legacy row changed the balance: %', bal; end if;

  -- T19: global invariants
  checks := checks + 1;
  if (select count(*) from public.account_reconciliation()) <> 0 then
    raise exception 'FAIL T19 reconciliation found % mismatches', (select count(*) from public.account_reconciliation());
  end if;
  checks := checks + 1;
  if (select coalesce(sum(pending_balance), 0) from public.customers where id <> cid) <> others_total then
    raise exception 'FAIL T19 other customers changed during tests';
  end if;

  raise exception 'DRYRUN_OK: % checks passed. Total balance (all real customers) = %, opening movements = %. Everything rolled back.',
    checks, others_total, opening_rows;
end
$test$;
