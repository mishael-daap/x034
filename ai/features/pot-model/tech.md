# Technical Plan

## Components
- `supabase/migrations/0005_pot_model.sql` — rename `jobs.pay_per_hour → total_payout`; rebuild the `jobs_values_valid` check constraint with `total_payout >= 1.0` (platform floor, commented)
- `supabase/seed.sql` — column + values: `total_payout = old pay_per_hour × duration_hours` (all ≥ floor)
- `lib/jobs.ts` — `maxPoolSize(totalPayout)` = `Math.max(1, Math.floor(totalPayout / PLATFORM_EARNINGS_FLOOR))`; add `estimateEarnings(totalPayout, poolSize)` = `totalPayout / Math.max(poolSize, 1)`
- `lib/lock.ts` — job select `total_payout`; `earningsAmount = total_payout ÷ pool size` (was `pay × (duration ÷ pool)` — identical value)
- `app/api/marketplace/route.ts` — select/type/response `total_payout`; `estimated_earnings = totalPayout / poolCount`
- `app/api/marketplace/[jobId]/route.ts` — same (detail + signed-in context)
- `app/api/marketplace/[jobId]/commit/route.ts` — select + `maxPoolSize(job.total_payout)`
- `app/api/nodes/route.ts` — select/type; `estimated_earnings = total_payout × (actual_duration_hours ?? duration_hours) ÷ duration_hours`
- `components/marketplace/marketplace-client.tsx` — `total_payout` field; label "Pay / hour" → "Total pool"
- `components/marketplace/job-detail-client.tsx` — same

## API
- Jobs payloads now carry `total_payout` (number) instead of `pay_per_hour`
- `GET /api/marketplace` — list: `total_payout`, `max_pool` (= `floor(pot ÷ floor)`), `estimated_earnings` (= `pot ÷ poolCount`)
- `GET /api/marketplace/[jobId]` — detail: same + realized values at/after lock (`actual_duration_hours`)
- `POST /api/marketplace/[jobId]/commit` — capacity check `maxPoolSize(job.total_payout)`
- `POST /api/marketplace/[jobId]/lock` — earnings `total_payout ÷ pool size`
- `GET /api/nodes` — assignment `estimated_earnings` = realized per-node share

## Data Model
```
jobs {
  id, company, min_tier, required_referrals,
  total_payout numeric not null,          -- was pay_per_hour; pot = old rate × duration_hours
  duration_hours numeric not null,        -- total node-hours of work (unchanged)
  actual_duration_hours numeric,          -- unchanged: frozen at lock = duration_hours ÷ pool size
  starts_at, status, created_at
}
constraint jobs_values_valid:
  required_referrals >= 0
  and total_payout >= 1.0                 -- platform earnings floor (see lib/constants.ts)
  and duration_hours > 0
  and (actual_duration_hours is null or actual_duration_hours >= 0)
```
- `user_balances` view unchanged (reads `actual_duration_hours` only)
- 0005 is a rename + constraint rebuild; old migrations untouched (history preserved)

## Flow
Browse (pot + est. per node) → commit (capacity = `pot ÷ floor`) → lock (`actual_duration = duration ÷ pool`; earnings = `pot ÷ pool`) → elapsed (`starts_at + actual_duration`) → balance includes earnings

## Notes
- Pure rename semantics: `pot = pay_per_hour × duration_hours` everywhere; behavior unchanged
- Effective hourly rate = `pot ÷ duration_hours`, pool-independent, not stored or displayed
- `actual_duration_hours` retained: lock snapshot, elapsed gate, lock marker, zero-pool fallback
- Applies after existing migrations; hosted DB: apply 0005, then reseed
