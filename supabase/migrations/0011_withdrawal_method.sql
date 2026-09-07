-- =============================================================================
-- 0011_withdrawal_method.sql — Admin-chosen withdrawal amount method
--
-- The admin picks how users choose a withdrawal amount:
--   mode 'input'   — the free-form amount field (as before)
--   mode 'presets' — fixed-amount buttons the admin curates
-- Exactly one method is shown on the user's withdraw page.
--
-- 1. app_settings: tiny key/value store. Key 'withdrawal_mode' holds a JSON
--    string ('input' | 'presets'). Absent row = 'input' (app-level default).
-- 2. withdrawal_presets: the fixed amounts (USD) offered as buttons when mode
--    is 'presets'.
--
-- Additive only; no existing tables touched.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. app_settings
-- -----------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null
);

-- -----------------------------------------------------------------------------
-- 2. withdrawal_presets
-- -----------------------------------------------------------------------------
create table if not exists public.withdrawal_presets (
  id uuid primary key default gen_random_uuid(),
  amount numeric not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists withdrawal_presets_amount_idx on public.withdrawal_presets (amount);
