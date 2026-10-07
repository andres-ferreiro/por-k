-- Trigger functions must never be callable through the API (PostgREST RPC).
-- Triggers still fire normally: they run as the table owner, not the caller.
-- Already applied to production as `partial_payments_revoke_trigger_fn_execute`.
-- Safe to re-run.

revoke execute on function public.payments_write_ledger()   from public, anon, authenticated;
revoke execute on function public.customers_guard_balance() from public, anon, authenticated;
