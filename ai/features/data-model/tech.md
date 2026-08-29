# Technical Plan

## Components
- supabase/migrations/0001_init.sql — schema (tables, constraints, indexes, RLS, trigger)
- supabase/seed.sql — seed node_tiers + banks
- dependencies/supabase/docs.md — official Supabase docs (per dependency rules)
- No API routes/services in this feature — schema only

## API
- None (schema-only feature; no endpoints)

## Data Model

```
User (profile) {
  id uuid PK → auth.users
  name text
  email text
  referral_code text unique
  referrer uuid → users.id (nullable, immutable)
  bank uuid → banks.id
  account_number text
  balance numeric default 0
  created_at
}

Bank {
  id
  name text unique
}

Company {
  id
  name text
}

NodeTier {
  id
  code text unique
  name text
  vcpu int
  ram_gb int
  gpu int (physical GPU count)
  bandwidth int (Gbps)
  price numeric
}

Node {
  id
  owner uuid → users.id
  tier uuid → node_tiers.id
  status text (available/committed/active)
}

Job {
  id
  company uuid → companies.id
  min_tier uuid → node_tiers.id
  required_referrals int default 0
  pay_per_hour numeric
  duration_hours numeric
  actual_duration_hours numeric
  starts_at timestamptz
  status text (open/locked/completed/cancelled)
}

Assignment {
  id
  node uuid → nodes.id
  job uuid → jobs.id
  status text (committed/active/completed)
}

Transaction {
  id
  user uuid → users.id
  type text (earnings/withdrawal)
  amount numeric (signed)
  status text (pending/processed — withdrawals only)
  reference_id uuid (→ assignment, nullable)
}
```

## Flow
Migration creates tables in FK order (banks → companies → node_tiers → users → nodes → jobs → assignments → transactions) → indexes/constraints → RLS policies → trigger (referrer immutability) → seed → verify.

## Notes
- Supabase is a new dependency → docs required at ai/dependencies/supabase/docs.md before implementation
- Migration run via Supabase CLI (supabase db push / db reset)
- No application code in this feature
