-- =============================================================================
-- 0012_payouts.sql — Paystack bank payouts (roadmap 6)
--
-- 1. banks: `code` (Paystack NUBAN code), `currency`, `is_test`. The catalogue
--    is synced from Paystack by lib/banks.ts (264 transfer-capable NGN banks);
--    the legacy 4 rows are renamed to Paystack names so existing profile and
--    withdrawal references survive. A sandbox-only "Test Bank (sandbox)" row
--    (Paystack test code 001) is seeded and hidden unless the key is sk_test_.
-- 2. users: `account_name` — the name Paystack resolves for the saved bank +
--    account number. Users never type it.
-- 3. withdrawals: statuses become pending | processing | paid | failed |
--    declined. Legacy `approved` rows become `paid` (they were booked as
--    processed ledger debits under the simulated flow).
-- 4. payouts: one row per transfer attempt. Unique reference is the
--    idempotency key; a retry is a new attempt, never a new reference for the
--    same attempt. `refunded_at` marks a failure that already restored funds.
-- 5. transfer_recipients: Paystack recipient_code per destination, reused
--    instead of re-created on every payout.
-- 6. transactions: add `withdrawal_refund` (positive credit written when a
--    payout fails or reverses) and recreate user_balances so it counts
--    immediately.
--
-- Additive apart from the withdrawals status migration; 0001–0011 untouched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. banks
-- -----------------------------------------------------------------------------
alter table public.banks add column if not exists code text;
alter table public.banks add column if not exists currency text not null default 'NGN';
alter table public.banks add column if not exists is_test boolean not null default false;

-- Paystack codes are unique across the catalogue (partial: pre-sync rows have none).
create unique index if not exists banks_code_key on public.banks (code) where code is not null;

-- Legacy seeded names → Paystack names (names only; FKs stay valid).
update public.banks set name = 'First Bank of Nigeria' where name = 'First Bank';
update public.banks set name = 'Guaranty Trust Bank' where name = 'GTBank';

-- Sandbox bank: Paystack test code 001 resolves any 10-digit number as
-- "TEST ACCOUNT <number>". Hidden from the picker unless the key is sk_test_.
insert into public.banks (name, code, currency, is_test)
values ('Test Bank (sandbox)', '001', 'NGN', true)
on conflict (name) do update
  set code = excluded.code, currency = excluded.currency, is_test = true;

-- -----------------------------------------------------------------------------
-- 2. users: Paystack-verified account name
-- -----------------------------------------------------------------------------
alter table public.users add column if not exists account_name text;

-- -----------------------------------------------------------------------------
-- 3. withdrawals: payout lifecycle statuses
-- -----------------------------------------------------------------------------
alter table public.withdrawals drop constraint if exists withdrawals_status_valid;

update public.withdrawals set status = 'paid' where status = 'approved';

alter table public.withdrawals add constraint withdrawals_status_valid
  check (status in ('pending', 'processing', 'paid', 'failed', 'declined'));

-- -----------------------------------------------------------------------------
-- 4. payouts
-- -----------------------------------------------------------------------------
create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  withdrawal_id uuid not null references public.withdrawals (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete restrict,
  reference text not null unique,              -- payout_<uuid>; idempotency key
  recipient_code text,                         -- RCP_… from Paystack
  transfer_code text,                          -- TRF_… from Paystack
  amount_usd numeric not null check (amount_usd > 0),   -- 90% of the request
  amount_kobo bigint not null check (amount_kobo > 0),  -- what Paystack sends
  rate numeric not null check (rate > 0),      -- USD_TO_NGN snapshot
  currency text not null default 'NGN',
  status text not null default 'initialized',
  fee_charged numeric,                         -- Paystack transfer fee (platform pays)
  failure_reason text,
  attempt int not null default 1,
  refunded_at timestamptz,                     -- set when funds were restored
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payouts_status_valid check (
    status in ('initialized', 'queued', 'otp_required', 'success', 'failed', 'reversed')
  )
);

create index if not exists payouts_withdrawal_idx on public.payouts (withdrawal_id);
create index if not exists payouts_status_idx on public.payouts (status);

-- -----------------------------------------------------------------------------
-- 5. transfer_recipients (reuse across payouts)
-- -----------------------------------------------------------------------------
create table if not exists public.transfer_recipients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  bank_code text not null,
  account_number text not null,
  recipient_code text not null,
  account_name text,
  created_at timestamptz not null default now(),
  constraint transfer_recipients_destination_key unique (user_id, bank_code, account_number)
);

-- -----------------------------------------------------------------------------
-- 6. transactions: add 'withdrawal_refund'
-- -----------------------------------------------------------------------------
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('purchase', 'referral', 'platform_earnings', 'node_sale', 'earnings', 'withdrawal', 'funding', 'withdrawal_refund'));

create or replace view public.user_balances
with (security_invoker = true) as
select
  t.user_id,
  sum(case
    when t.type = 'earnings'
      and j.starts_at + j.actual_duration_hours * interval '1 hour' <= now()
      then t.amount
    when t.type = 'withdrawal' and t.status = 'processed' then t.amount
    when t.type in ('purchase', 'referral', 'platform_earnings', 'node_sale', 'funding', 'withdrawal_refund') then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
