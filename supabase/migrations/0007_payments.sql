-- =============================================================================
-- 0007_payments.sql — Paystack node payments (roadmap 5)
--
-- 1. payments table: the external Paystack charge record for a node purchase.
--      - created at initialize (status 'initialized', unique Paystack reference)
--      - flipped to 'success' once server-side verification passes
--      - the unique reference is the idempotency key: a duplicate callback can
--        never double-credit (a second claim is a no-op)
-- 2. transactions: add 'funding' to the type check — the buyer credit written
--    right after a verified payment (+P, immediate), so the existing purchase
--    split (buyer debit, node sale, platform cut, referral) runs unchanged.
-- 3. user_balances: 'funding' counts immediately (same class as the
--    purchase / referral / platform_earnings / node_sale credits).
--
-- Additive only: 0001–0006 untouched; the type-check rebuild merely adds a
-- type, so existing rows stay valid (no NOT VALID needed, unlike 0006).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. payments
-- -----------------------------------------------------------------------------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  tier uuid not null references public.node_tiers (id),
  reference text not null unique,          -- Paystack transaction reference (idempotency key)
  amount numeric not null,                 -- charged amount in the currency's major unit (NGN)
  currency text not null default 'NGN',
  status text not null default 'initialized',
  created_at timestamptz not null default now(),
  constraint payments_status_valid check (status in ('initialized', 'success'))
);

create index if not exists payments_user_idx on public.payments (user_id);
create index if not exists payments_status_idx on public.payments (status);

-- -----------------------------------------------------------------------------
-- 2. transactions: add 'funding' to the type check
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('purchase', 'referral', 'platform_earnings', 'node_sale', 'earnings', 'withdrawal', 'funding'));

-- -----------------------------------------------------------------------------
-- 3. user_balances: funding credits count immediately
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
    when t.type in ('purchase', 'referral', 'platform_earnings', 'node_sale', 'funding') then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
