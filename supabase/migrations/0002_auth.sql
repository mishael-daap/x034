-- =============================================================================
-- 0002_auth.sql — Make users a standalone account table (custom auth)
--
-- Supabase Auth (the library) is NOT used. Authentication is plain
-- verification of inputted values against the users table:
--   login = fetch row by email OR phone, compare password_hash.
--
-- Changes:
--   - Drop FK to auth.users (no library accounts will exist)
--   - id: DB-generated uuid (default gen_random_uuid())
--   - Add email (unique, nullable)  — identification only
--   - Add phone (unique, nullable)  — identification only
--   - Add password_hash (not null)  — scrypt "salt:hash" credential
--   - Check: at least one identifier (email or phone) present
-- =============================================================================

alter table public.users drop constraint users_id_fkey;
alter table public.users alter column id set default gen_random_uuid();

alter table public.users add column email text unique;
alter table public.users add column phone text unique;
alter table public.users add column password_hash text not null;

alter table public.users add constraint users_identifier_present
  check (email is not null or phone is not null);
