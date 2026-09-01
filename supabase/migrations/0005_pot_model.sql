-- =============================================================================
-- 0005_pot_model.sql — Pot model: jobs.pay_per_hour → total_payout
--
-- 1. Rename jobs.pay_per_hour to total_payout (the pot: a company-set budget
--    split across the pool; per-node earnings = total_payout ÷ pool size at lock).
-- 2. Rebuild the jobs_values_valid check constraint:
--      - total_payout >= 1.0 (platform earnings floor — PLATFORM_EARNINGS_FLOOR
--        in lib/constants.ts; every job must satisfy the floor guarantee)
--
-- The user_balances view (0003/0004) is unaffected — it reads actual_duration_hours only.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. rename the column
-- -----------------------------------------------------------------------------
alter table public.jobs rename column pay_per_hour to total_payout;

-- -----------------------------------------------------------------------------
-- 2. rebuild the check constraint (Postgres can't alter checks in place)
-- -----------------------------------------------------------------------------
alter table public.jobs drop constraint jobs_values_valid;
alter table public.jobs add constraint jobs_values_valid check (
  required_referrals >= 0
  and total_payout >= 1.0 -- platform earnings floor (PLATFORM_EARNINGS_FLOOR in lib/constants.ts)
  and duration_hours > 0
  and (actual_duration_hours is null or actual_duration_hours >= 0)
);
