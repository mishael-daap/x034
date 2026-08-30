# Feature: Job Simulation

## Purpose
Seed the database with simulated companies and jobs so the marketplace (item 5) and matching (item 6) have realistic data to work with. Includes the node_tiers and banks seeds left over from item 1 (required prerequisites).

## User Flow
1. Developer runs `supabase db query --linked -f supabase/seed.sql`
2. node_tiers C/B/A, banks, 8 companies, and 18 open jobs are created (or refreshed)
3. Marketplace can list jobs with pay/hr, duration, start time, tier, and referral requirement

## Rules
- Idempotent: re-running never duplicates rows
- Tier seed upserts by `code` (any existing tier rows win) — safe alongside item 3 work
- Companies/banks upsert by natural key (`id` / `name`)
- Jobs upsert by `id`; on re-run their `starts_at` refreshes and `status` resets to `open` (sandbox never goes stale)
- Jobs reference tiers by `code` subselect, so they work regardless of tier row ids
- Jobs: pay/hr varies by tier (C $1.5–4, B $3–8, A $6–12); durations 2–24h (fractional); `required_referrals` 0–15, independent of tier (per business rules); all `starts_at` within the next ~48h, status `open`
- All jobs are `open` — locked/completed states are out of scope (added when matching/earnings land)

## Acceptance Criteria
- [ ] Seed applies cleanly via `supabase db query --linked`
- [ ] node_tiers has exactly C/B/A matching business-rules specs
- [ ] banks has 4 sample banks
- [ ] companies has 8 rows
- [ ] jobs has 18 open rows with valid tier FKs, pay, duration, referrals, future start times
- [ ] Re-running the seed produces no duplicates and refreshes job start times
