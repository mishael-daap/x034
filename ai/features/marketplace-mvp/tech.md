# Technical Plan

## Components
- `app/marketplace/page.tsx` — job list (public read, mobile-first)
- `app/marketplace/[jobId]/page.tsx` — job detail + purchase/commit entry points
- `app/nodes/purchase/page.tsx` — node purchase page
- `app/nodes/page.tsx` — my nodes list
- `lib/queries.ts` — data access (jobs, nodes, assignments, balance)
- `lib/actions.ts` — server actions: `purchaseNode`, `commitNode`, `lockAndEarn`
- `supabase/migrations/0002_transaction_purchase_type.sql` — add `'purchase'` to transaction type check
- Seed — companies + sample jobs

## API (server actions)
- `purchaseNode(tierId)` — create node + `'purchase'` transaction (debit); no balance gate in Phase 1
- `commitNode(nodeId, jobId)` — create assignment (`committed`); checks: node owned, tier ≥ job tier, within window (`now() <= starts_at − 1h`), node not occupied (no non-elapsed assignment)
- `lockAndEarn(jobId)` — called at lock: assignment → `active`, create earnings transaction (`pay_per_hour × duration_hours`, reference → assignment); idempotent
- No completion action — elapsed time is handled entirely by the view

## Data Model
Uses existing tables: `jobs`, `node_tiers`, `nodes`, `assignments`, `transactions`, `user_balances`.

Migration 0002:
```sql
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('earnings', 'withdrawal', 'purchase'));
```

Updated view (time-aware balance):
```sql
create or replace view public.user_balances
with (security_invoker = true) as
select
  t.user_id,
  sum(case
    when t.type = 'earnings'
      and j.starts_at + j.duration_hours * interval '1 hour' <= now()
      then t.amount
    when t.type <> 'earnings' then t.amount
    else 0
  end) as balance
from public.transactions t
left join public.assignments a on a.id = t.reference_id
left join public.jobs j on j.id = a.job
group by t.user_id;
```

## Flow
Browse (public read) → job detail → purchase node (create node + `purchase` transaction) → commit (create assignment with checks) → lock at `starts_at` (assignment `active` + earnings transaction) → elapsed time → balance view includes earnings → node recommitable (derived from time)

## Notes
- Everything time-derived: job status, node availability, balance eligibility — no scheduler, no cron
- Stored status columns are metadata/display; the source of truth is time derivation
- Mobile-first per architecture policy
- Referral enforcement deferred to roadmap item 4 (display-only in MVP)
