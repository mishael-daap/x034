-- =============================================================================
-- 0006_revenue_model.sql — Revenue & commission model
--
-- 1. Rebuild the transactions type check:
--      - add 'referral' (referrer commission credit), 'platform_earnings'
--        (platform cut), 'node_sale' (platform sale proceeds)
--      - remove 'deposit' (the free-funds faucet is gone). Added NOT VALID so
--        any legacy deposit rows already in the DB don't break the migration;
--        the recreated user_balances view below stops counting them.
-- 2. Add transactions.node (nullable FK → nodes): the node whose sale caused
--    a purchase-family row (purchase / referral / platform_earnings / node_sale),
--    so every entry is attributable. Job earnings keep reference_id → assignments.
-- 3. Seed the platform actor row in users (fixed id = PLATFORM_USER_ID in
--    lib/constants.ts, reserved email, unusable hash, own referral code) so
--    platform earnings live on its balance like any user's.
-- 4. Recreate user_balances: earnings count after the job elapses (unchanged),
--    withdrawals only when processed (unchanged), and purchase / referral /
--    platform_earnings / node_sale count immediately. No deposit term.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. transactions: type check — add referral/platform_earnings/node_sale, drop deposit
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('purchase', 'referral', 'platform_earnings', 'node_sale', 'earnings', 'withdrawal'))
  not valid;

-- -----------------------------------------------------------------------------
-- 2. transactions: node attribution (nullable FK → nodes)
-- -----------------------------------------------------------------------------
alter table public.transactions add column node uuid references public.nodes (id);

-- -----------------------------------------------------------------------------
-- 3. users: seed the platform actor (idempotent)
-- -----------------------------------------------------------------------------
insert into public.users (id, name, referral_code, email, password_hash) values (
  '00000000-0000-4000-8000-000000000001', -- PLATFORM_USER_ID (lib/constants.ts)
  'Platform',
  'PLATFORM',                 -- reserved code; excluded as a referrer at signup
  'platform@x034.local',
  'unusable:platform-account' -- never a valid scrypt hash; never logged in
) on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. user_balances: new credits immediate, no deposit term
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
    when t.type in ('purchase', 'referral', 'platform_earnings', 'node_sale') then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
