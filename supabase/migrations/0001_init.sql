-- =============================================================================
-- 0001_init.sql — Compute marketplace schema (bare minimum, Phase 1)
-- Tables: banks, companies, node_tiers, users, nodes, jobs, assignments,
--         transactions
-- Plus: user_balances view
--
-- Deliberately deferred (all additive later, no migration pain):
--   - RLS policies + grants          → with auth feature (item 2)
--   - referrer-immutability trigger  → app-enforced for now
--   - partial unique indexes on assignments (one active assignment per node,
--     one worker per job)            → with matching feature (item 6)
--   - compound transaction checks    → app-enforced for now
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. banks
-- -----------------------------------------------------------------------------
create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 2. companies (simulated job posters)
-- -----------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 3. node_tiers (seeded catalog: C / B / A)
-- -----------------------------------------------------------------------------
create table if not exists public.node_tiers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  vcpu int not null,
  ram_gb int not null,
  gpu int not null default 0,          -- physical GPU count
  bandwidth int not null default 0,    -- Gbps
  price numeric not null,
  created_at timestamptz not null default now(),
  constraint node_tiers_specs_non_negative check (
    vcpu >= 0 and ram_gb >= 0 and gpu >= 0 and bandwidth >= 0 and price >= 0
  )
);

-- -----------------------------------------------------------------------------
-- 4. users (profiles; extends Supabase auth.users)
-- -----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete restrict,
  name text not null,
  referral_code text not null unique,
  referrer uuid references public.users (id),  -- immutable once set (app-enforced)
  bank uuid references public.banks (id),
  account_number text,
  created_at timestamptz not null default now(),
  constraint users_no_self_referral check (referrer is null or referrer <> id)
);

-- -----------------------------------------------------------------------------
-- 5. nodes (compute instances owned by users)
-- -----------------------------------------------------------------------------
create table if not exists public.nodes (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.users (id) on delete restrict,
  tier uuid not null references public.node_tiers (id),
  status text not null default 'available',
  created_at timestamptz not null default now(),
  constraint nodes_status_valid check (status in ('available', 'committed', 'active'))
);

-- -----------------------------------------------------------------------------
-- 6. jobs (posted by companies; one node works a job)
-- -----------------------------------------------------------------------------
create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  company uuid not null references public.companies (id),
  min_tier uuid not null references public.node_tiers (id),
  required_referrals int not null default 0,
  pay_per_hour numeric not null,
  duration_hours numeric not null,
  actual_duration_hours numeric,       -- filled at completion
  starts_at timestamptz not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  constraint jobs_values_valid check (
    required_referrals >= 0
    and pay_per_hour >= 0
    and duration_hours > 0
    and (actual_duration_hours is null or actual_duration_hours >= 0)
  ),
  constraint jobs_status_valid check (status in ('open', 'locked', 'completed', 'cancelled'))
);

-- -----------------------------------------------------------------------------
-- 7. assignments (node ↔ job lifecycle: committed → active → completed)
-- -----------------------------------------------------------------------------
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  node uuid not null references public.nodes (id) on delete restrict,
  job uuid not null references public.jobs (id) on delete restrict,
  status text not null default 'committed',
  created_at timestamptz not null default now(),
  constraint assignments_status_valid check (status in ('committed', 'active', 'completed')),
  constraint assignments_no_duplicate_commit unique (node, job)
);

-- -----------------------------------------------------------------------------
-- 8. transactions (balance ledger; earnings in, withdrawals out)
-- -----------------------------------------------------------------------------
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  type text not null,
  amount numeric not null,             -- signed: earnings +, withdrawal − (app-enforced)
  status text,                         -- withdrawals only (app-enforced)
  reference_id uuid references public.assignments (id),
  created_at timestamptz not null default now(),
  constraint transactions_type_valid check (type in ('earnings', 'withdrawal'))
);

create index if not exists transactions_user_idx on public.transactions (user_id);
create index if not exists transactions_reference_idx on public.transactions (reference_id);

-- -----------------------------------------------------------------------------
-- 9. user_balances view (derived; no balance column on users)
-- -----------------------------------------------------------------------------
create or replace view public.user_balances
with (security_invoker = true) as
select
  user_id,
  sum(amount) as balance
from public.transactions
group by user_id;
