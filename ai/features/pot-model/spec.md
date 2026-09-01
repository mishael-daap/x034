# Feature: Pot Model (total_payout)

## Purpose
Replace `jobs.pay_per_hour` with a company-set `total_payout` pot. The pool splits a constant pot: per-node earnings and the job's wall-clock duration depend on pool size, so a per-hour rate on the job is misleading. This is a modeling/rename change — behavior is unchanged (pot = old pay_per_hour × duration_hours everywhere).

## User Flow
1. A company (seeded) creates a job with a **total payout (pot)** + `duration_hours` + fixed start time
2. Node owner browses: sees **"Total pool: $X"** and **"Est. per node: $Y (Z nodes)"** — no "pay per hour"
3. Node owner commits to the pool (rules unchanged: tier match, window, capacity, availability)
4. At lock: `actual_duration_hours = duration_hours ÷ pool size`; each pool node earns `total_payout ÷ pool size`
5. Balance includes earnings once `starts_at + actual_duration_hours` has elapsed (unchanged)

## Rules
- `jobs.total_payout` replaces `jobs.pay_per_hour` (1:1 conversion: pot = old rate × `duration_hours`)
- `total_payout` must be ≥ the platform earnings floor (DB-enforced; floor = 1.0 in Phase 1, `PLATFORM_EARNINGS_FLOOR` in `lib/constants.ts`)
- Every node in a job's pool earns `total_payout ÷ pool size`, regardless of node tier (no bonus for higher tiers)
- Effective per-node hourly rate is derived (`total_payout ÷ duration_hours`), is pool-independent, and is **not shown to users**
- Capacity: `n_max = floor(total_payout ÷ platform floor)`; a job with `total_payout < floor` is not allowed
- `actual_duration_hours` stays on the job: frozen at lock (`duration_hours ÷ pool size`), drives the balance/status/node-availability elapsed gate, doubles as the lock marker, and is the zero-pool fallback
- Jobs never actually run in Phase 1; the pot is split at lock and credited at elapsed (unchanged)

## Acceptance Criteria
- [ ] Migration 0005 renames `pay_per_hour → total_payout` with data converted (pot = rate × duration); constraint requires `total_payout ≥ 1.0`
- [ ] Migrations 0001–0004 untouched; a fresh install runs 0001 → 0005 cleanly
- [ ] Seed jobs use `total_payout` (pot ≥ floor); reseeding populates all 18 jobs
- [ ] API + UI expose `total_payout` ("Total pool") and per-node estimates; no "Pay / hour" anywhere
- [ ] Capacity matches previous behavior: `floor(pot ÷ floor)` ≡ `floor(rate × duration ÷ floor)`
- [ ] Lock credits `total_payout ÷ pool size` per node and is idempotent
- [ ] Balance/status/availability elapsed logic is unchanged and correct
- [ ] Typecheck + lint clean; E2E earning loop re-verified (single + multi-node pool)
