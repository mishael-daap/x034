-- =============================================================================
-- 0004_deposit_balance.sql — Deposits + 2-step withdrawals in the balance view
--
-- 1. Add 'deposit' as a transaction type (test funds, positive debit-free credit).
-- 2. Recreate user_balances so the ledger models 2-step withdrawals:
--      - earnings count only after the job elapses (unchanged)
--      - deposits and purchases count immediately
--      - withdrawals count only once PROCESSED (pending = in flight, still
--        available in the balance; processed = funds have left)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. transactions: add 'deposit' to the type check
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('earnings', 'withdrawal', 'purchase', 'deposit'));

-- -----------------------------------------------------------------------------
-- 2. user_balances: pending withdrawals excluded, deposits immediate
-- -----------------------------------------------------------------------------
create or replace view public.user_balances
with (security_invoker = true) as
select
  t.user_id,
  sum(case
    when t.type = 'earnings'
      and j.starts_at + j.actual_duration_hours * interval '1 hour' <= now()
      then t.amount
    when t.type = 'withdrawal' and t.status = 'processed' then t.amount
    when t.type in ('purchase', 'deposit') then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
