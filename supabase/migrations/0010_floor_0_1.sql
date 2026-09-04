-- =============================================================================
-- 0010_floor_0_1.sql — Platform earnings floor 1.0 → 0.1
--
-- lib/constants.ts PLATFORM_EARNINGS_FLOOR moved to 0.1 (pool capacity =
-- floor(total_payout ÷ floor)); relax the jobs check so the DB agrees.
-- Existing rows (all pots ≥ 0.1) stay valid; relaxing never invalidates data.
-- =============================================================================

alter table public.jobs drop constraint jobs_values_valid;
alter table public.jobs add constraint jobs_values_valid check (
  required_referrals >= 0
  and total_payout >= 0.1 -- platform earnings floor (PLATFORM_EARNINGS_FLOOR in lib/constants.ts)
  and duration_hours > 0
  and (actual_duration_hours is null or actual_duration_hours >= 0)
);
