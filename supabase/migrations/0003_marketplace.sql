-- =============================================================================
-- 0003_marketplace.sql — Marketplace MVP foundation
--
-- 1. Allow 'purchase' as a transaction type (buying a node is a debit).
-- 2. Make user_balances time-aware: earnings count only once the job's
--    actual duration has elapsed (starts_at + actual_duration_hours <= now()).
--    Purchases and withdrawals count immediately.
--
-- Notes:
--   - actual_duration_hours is filled once at lock (duration_hours ÷ pool size).
--   - The platform earnings floor is an app-level constant, not schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. transactions: add 'purchase' to the type check
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('earnings', 'withdrawal', 'purchase'));

-- -----------------------------------------------------------------------------
-- 2. user_balances: elapsed-time-aware balance (earnings count after job elapses)
-- -----------------------------------------------------------------------------
create or replace view public.user_balances
with (security_invoker = true) as
select
  t.user_id,
  sum(case
    when t.type = 'earnings'
      and j.starts_at + j.actual_duration_hours * interval '1 hour' <= now()
      then t.amount
    when t.type <> 'earnings' then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
