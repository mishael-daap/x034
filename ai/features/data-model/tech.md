# Technical Plan

## Components
- supabase/migrations/0001_init.sql — schema (tables, constraints, indexes, user_balances view)
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

## View
user_balances — balance per user, derived from the ledger (no balance column):

```sql
CREATE VIEW user_balances
WITH (security_invoker = true) AS
SELECT user_id, SUM(amount) AS balance
FROM transactions
GROUP BY user_id;
```

security_invoker applies the calling user's RLS to the underlying table, so users only see their own balance.

## Flow
Migration creates tables in FK order (banks → companies → node_tiers → users → nodes → jobs → assignments → transactions) → indexes/constraints → user_balances view → seed → verify.

## Notes
- Supabase is a new dependency → docs required at ai/dependencies/supabase/docs.md before implementation
- Migration run via Supabase CLI (supabase db push / db reset)
- No application code in this feature
- Deferred (additive later): RLS policies + grants (with auth feature), referrer-immutability trigger (app-enforced), partial unique indexes on assignments (with matching feature), compound transaction checks (app-enforced)
