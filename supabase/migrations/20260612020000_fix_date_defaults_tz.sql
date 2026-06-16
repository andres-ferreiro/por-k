-- Fix date column defaults to use local business timezone instead of UTC.
-- UTC default caused dates to roll over to the next day after 6 PM CDT (UTC-6).

ALTER TABLE public.deliveries
  ALTER COLUMN delivery_date
  SET DEFAULT (now() AT TIME ZONE 'America/Ciudad_Juarez')::date;

ALTER TABLE public.expenses
  ALTER COLUMN expense_date
  SET DEFAULT (now() AT TIME ZONE 'America/Ciudad_Juarez')::date;

COMMENT ON COLUMN public.deliveries.delivery_date IS
  'Calendar date of the delivery in America/Ciudad_Juarez local time.';

COMMENT ON COLUMN public.expenses.expense_date IS
  'Calendar date of the expense in America/Ciudad_Juarez local time.';
