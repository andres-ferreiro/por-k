-- Add pending_balance field to customers for carry-over unpaid amounts
alter table public.customers
  add column if not exists pending_balance numeric(12,2) not null default 0;

-- Add a flag to payments to mark them as carried over to next day
alter table public.payments
  add column if not exists carried_over boolean not null default false;

-- Function to carry over unpaid balances for a branch on a given date.
-- Call this at the start of a new day (or from dispatch creation) to accumulate
-- unpaid payments from the previous date into customers.pending_balance.
create or replace function public.carry_over_pending_balance(p_branch_id uuid, p_date date)
returns void
language plpgsql
security definer
as $$
declare
  r record;
begin
  -- For each customer with unpaid payments on p_date, add them to pending_balance
  for r in
    select customer_id, sum(amount) as total
    from public.payments
    where branch_id = p_branch_id
      and status = 'pending'
      and carried_over = false
      and paid_at::date = p_date
    group by customer_id
  loop
    update public.customers
    set pending_balance = pending_balance + r.total
    where id = r.customer_id;

    -- Mark these payments as carried over so they don't double-accumulate
    update public.payments
    set carried_over = true
    where branch_id = p_branch_id
      and customer_id = r.customer_id
      and status = 'pending'
      and carried_over = false
      and paid_at::date = p_date;
  end loop;
end;
$$;

grant execute on function public.carry_over_pending_balance(uuid, date) to authenticated;
