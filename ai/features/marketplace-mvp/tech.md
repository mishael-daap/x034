# Technical Plan

## Components
- `app/marketplace/page.tsx` — job list (public read, mobile-first)
- `app/marketplace/[jobId]/page.tsx` — job detail + purchase/commit entry points
- `app/nodes/purchase/page.tsx` — node purchase page
- `app/nodes/page.tsx` — my nodes list
- `supabase/migrations/0003_marketplace.sql` — add `'purchase'` to transaction type check + time-aware `user_balances` view (elapsed check on `actual_duration_hours`)
- Platform earnings floor — app-level constant (hidden from users); caps each job's pool size
- Seed — companies + sample jobs (deferred; hosted DB already populated ad hoc; jobs must satisfy pay × duration ≥ floor)

## API (route handlers — consistent with the auth feature's pattern)
- `GET /api/marketplace` — job list (public; includes current pool count)
- `GET /api/marketplace/[jobId]` — job detail (public; includes pool count + live per-node earnings estimate)
- `GET /api/nodes` — my nodes + balance (auth)
- `POST /api/nodes/purchase` — `purchaseNode`: create node + `'purchase'` transaction (debit); no balance gate in Phase 1
- `POST /api/marketplace/[jobId]/commit` — `commitNode`: create assignment (`committed`); checks: node owned, tier ≥ job tier, within window (`now() <= starts_at − 1h`), node not occupied (no non-elapsed assignment), pool below capacity (`n < floor(pay_per_hour × duration_hours ÷ floor)`)
- `POST /api/marketplace/[jobId]/lock` — `lockAndEarn`: called at lock for every pool node: fill `actual_duration_hours = duration_hours ÷ pool size` on the job, assignments → `active`, create one earnings transaction per node (`pay_per_hour × actual_duration_hours`, reference → assignment); idempotent
- No completion action — elapsed time is handled entirely by the view
- All routes use `supabaseFetch` (PostgREST) + `getSessionUser`, matching `app/api/auth/*`

## Data Model
Uses existing tables: `jobs`, `node_tiers`, `nodes`, `assignments`, `transactions`, `user_balances`.

Migration 0003 (0002 is already taken by the auth feature):
```sql
alter table public.transactions drop constraint transactions_type_valid;
alter table public.transactions add constraint transactions_type_valid
  check (type in ('earnings', 'withdrawal', 'purchase'));
```

Updated view (time-aware balance; elapsed check uses `actual_duration_hours`, set at lock):
```sql
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
```

Data model notes:
- `jobs.duration_hours` = total work (duration with one node); `jobs.actual_duration_hours` filled at lock = `duration_hours ÷ pool size`
- Platform earnings floor: app-level constant (not in schema), caps each job's pool size

## Flow
Browse (public read, live pool counts) → job detail (live per-node estimate) → purchase node (create node + `purchase` transaction) → commit (create assignment with checks incl. capacity) → lock at `starts_at` (fill actual duration, assignments `active`, earnings transaction per pool node) → elapsed time → balance view includes earnings → nodes recommittable (derived from time)

## Notes
- Everything time-derived: job status, node availability, balance eligibility — no scheduler, no cron
- Stored status columns are metadata/display; the source of truth is time derivation
- Pool size and per-node earnings are estimates until lock (final pool size); the earnings floor is a hidden platform constant
- Mobile-first per architecture policy
- Referral enforcement deferred to roadmap item 4 (display-only in MVP)
