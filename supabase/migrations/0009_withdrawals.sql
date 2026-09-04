-- =============================================================================
-- 0009_withdrawals.sql — Admin-approved withdrawals (roadmap 5.1)
--
-- 1. withdrawals table: the request record, separate from the ledger.
--      - status pending | approved | declined (only an approval creates the
--        ledger 'withdrawal' row — see POST /api/withdrawals/[id]/decision)
--      - destination snapshot (bank / account_number / account_name) taken
--        from the user's profile at request time
--      - reason set when declined; decided_at / decided_by on decision
-- 2. Legacy move: old ledger rows type='withdrawal' & status='pending' become
--    withdrawals (pending) and their ledger rows are deleted — they never
--    affected user_balances. Processed ledger rows stay as history.
-- 3. Admin identity: users.role ('user' | 'admin', default 'user'); the
--    platform user (PLATFORM_USER_ID) becomes the admin. Its login password
--    is set app-side (scrypt is not expressible in SQL) via a one-off script.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. withdrawals
-- -----------------------------------------------------------------------------
create table if not exists public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  amount numeric not null check (amount > 0),  -- positive requested amount
  status text not null default 'pending',
  bank uuid references public.banks (id),      -- destination snapshot
  account_number text,
  account_name text,
  reason text,                                 -- set when declined
  created_at timestamptz not null default now(),
  decided_at timestamptz,                      -- set on decision
  decided_by uuid references public.users (id), -- set on decision
  constraint withdrawals_status_valid check (status in ('pending', 'approved', 'declined'))
);

create index if not exists withdrawals_user_idx on public.withdrawals (user_id);
create index if not exists withdrawals_status_idx on public.withdrawals (status);

-- -----------------------------------------------------------------------------
-- 2. legacy move: pending ledger withdrawal rows → withdrawals (pending)
-- -----------------------------------------------------------------------------
insert into public.withdrawals (user_id, amount, status, created_at)
select user_id, abs(amount), 'pending', created_at
from public.transactions
where type = 'withdrawal' and status = 'pending';

delete from public.transactions
where type = 'withdrawal' and status = 'pending';

-- -----------------------------------------------------------------------------
-- 3. admin identity
-- -----------------------------------------------------------------------------
alter table public.users add column role text not null default 'user';
alter table public.users add constraint users_role_valid check (role in ('user', 'admin'));

update public.users
set role = 'admin'
where id = '00000000-0000-4000-8000-000000000001'; -- PLATFORM_USER_ID (lib/constants.ts)
