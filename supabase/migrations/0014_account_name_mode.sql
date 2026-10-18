-- =============================================================================
-- 0014_account_name_mode.sql — remember which Paystack mode verified a name
--
-- A sandbox verification must never be trusted in live mode (and vice versa).
-- Saving the destination records the mode; an unchanged-destination save only
-- skips re-resolution when the stored mode matches the active mode. Switching
-- PAYSTACK_MODE therefore re-resolves on the next save.
-- =============================================================================

alter table public.users add column if not exists account_name_mode text;

alter table public.users drop constraint if exists users_account_name_mode_valid;
alter table public.users add constraint users_account_name_mode_valid
  check (account_name_mode is null or account_name_mode in ('test', 'live'));
