-- =============================================================================
-- seed.sql — Simulated marketplace data (Phase 1, idempotent)
--
-- Contents:
--   1. node_tiers  — C / B / A catalog (prerequisite for jobs)
--   2. banks       — sample banks
--   3. companies   — simulated job posters
--   4. jobs        — open jobs across all tiers, starting within ~48h;
--                    total_payout = pot (≥ platform floor), split across the pool
--
-- Idempotency: re-running is safe. Jobs additionally REFRESH their start time
-- and status on re-run so the marketplace never goes stale in the sandbox.
--
-- Run against the hosted project with:
--   supabase db query --linked -f supabase/seed.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. node_tiers (C/B/A) — upsert by code, so any prior tier seed wins
-- -----------------------------------------------------------------------------
insert into public.node_tiers (id, code, name, vcpu, ram_gb, gpu, bandwidth, price) values
  ('4a2b9ad0-3189-4187-b7e5-16276c442c48', 'C', 'Standard',  4, 16, 1, 1,  10),
  ('75d29d21-aa22-4bde-be13-b094d0533fbb', 'B', 'Advanced',  8, 32, 2, 2,  50),
  ('327ec577-390a-42e0-b293-d348bf524eff', 'A', 'Top',      16, 64, 4, 4, 100)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 2. banks
-- -----------------------------------------------------------------------------
insert into public.banks (name) values
  ('First Bank'),
  ('Zenith Bank'),
  ('GTBank'),
  ('Access Bank')
on conflict (name) do nothing;

-- -----------------------------------------------------------------------------
-- 3. companies (simulated job posters)
-- -----------------------------------------------------------------------------
insert into public.companies (id, name) values
  ('0abf522c-bc27-4d8b-b463-28f356779963', 'Nebula Compute'),
  ('7dc18629-1270-4c7f-a675-4f04053982e6', 'Quantum Forge Labs'),
  ('9ef0eaa7-0c75-4839-9ef6-9ede8197a3a8', 'DataStream Analytics'),
  ('16a23cef-6d47-4ee9-988a-4c13a3faf3a2', 'PixelWorks Studio'),
  ('064c3147-c3a9-4bce-b2f5-eed9d8de5950', 'Helix Research'),
  ('4750ccd4-f7df-4320-a61a-5972c1b23b71', 'CloudPulse'),
  ('b26d04d8-e858-427a-8cf5-657d21c1868d', 'Vector Dynamics'),
  ('8d8a0405-3ae0-48a8-abaa-82447c3e1258', 'DeepGrid')
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- 4. jobs (open, starting within the next ~48h)
--    min_tier resolved by tier code so it works regardless of tier row ids
-- -----------------------------------------------------------------------------
insert into public.jobs
  (id, company, min_tier, required_referrals, total_payout, duration_hours, starts_at, status)
values
  -- Tier C
  ('8ca2b6b2-e512-4c73-9620-27b1080cd742', '0abf522c-bc27-4d8b-b463-28f356779963', (select id from public.node_tiers where code = 'C'), 0, 15.00,  6, now() + interval '3 hours',  'open'),
  ('763b06f1-d32f-4164-935b-aebe1b5b1862', '9ef0eaa7-0c75-4839-9ef6-9ede8197a3a8', (select id from public.node_tiers where code = 'C'), 0, 12.00,  4, now() + interval '8 hours',  'open'),
  ('800d7cf7-d51c-40cf-ab62-0c2e23d5b7ad', '064c3147-c3a9-4bce-b2f5-eed9d8de5950', (select id from public.node_tiers where code = 'C'), 2, 24.00, 12, now() + interval '24 hours', 'open'),
  ('b381cd03-118d-4fdf-ba3f-df21983b7827', '16a23cef-6d47-4ee9-988a-4c13a3faf3a2', (select id from public.node_tiers where code = 'C'), 0,  8.00,  2, now() + interval '6 hours',  'open'),
  ('88c5e40a-3705-4a0f-b124-22df1066362d', 'b26d04d8-e858-427a-8cf5-657d21c1868d', (select id from public.node_tiers where code = 'C'), 0, 36.00, 24, now() + interval '36 hours', 'open'),
  ('d58a7ed2-81cd-40b2-ad4a-4f2ea3c68bc3', '8d8a0405-3ae0-48a8-abaa-82447c3e1258', (select id from public.node_tiers where code = 'C'), 5, 28.00,  8, now() + interval '48 hours', 'open'),
  -- Tier B
  ('18440807-08f0-441c-89a5-969afdac8982', '7dc18629-1270-4c7f-a675-4f04053982e6', (select id from public.node_tiers where code = 'B'), 3, 30.00,  6, now() + interval '5 hours',  'open'),
  ('f4fa6786-1f89-4201-9ef0-5f77641cb129', '4750ccd4-f7df-4320-a61a-5972c1b23b71', (select id from public.node_tiers where code = 'B'), 0, 24.00,  4, now() + interval '12 hours', 'open'),
  ('0803cbf3-844f-4192-ba55-76d6285b5088', '0abf522c-bc27-4d8b-b463-28f356779963', (select id from public.node_tiers where code = 'B'), 5, 40.00, 10, now() + interval '20 hours', 'open'),
  ('cb747bef-ed92-489c-a779-e70b8caa56f7', '9ef0eaa7-0c75-4839-9ef6-9ede8197a3a8', (select id from public.node_tiers where code = 'B'), 2, 24.00,  3, now() + interval '9 hours',  'open'),
  ('1d8ff132-351d-4430-b022-ca350e58e4ae', '064c3147-c3a9-4bce-b2f5-eed9d8de5950', (select id from public.node_tiers where code = 'B'), 8, 56.00,  8, now() + interval '30 hours', 'open'),
  ('caf8c1bc-8b83-4769-b08b-8a9869007488', '16a23cef-6d47-4ee9-988a-4c13a3faf3a2', (select id from public.node_tiers where code = 'B'), 0, 72.00, 24, now() + interval '45 hours', 'open'),
  -- Tier A
  ('db7672ad-6a9a-4511-9ffd-1df1bca3b1ab', '8d8a0405-3ae0-48a8-abaa-82447c3e1258', (select id from public.node_tiers where code = 'A'), 5, 54.00,  6, now() + interval '4 hours',  'open'),
  ('935db226-8194-436a-91e3-6210059f849c', 'b26d04d8-e858-427a-8cf5-657d21c1868d', (select id from public.node_tiers where code = 'A'), 10, 48.00,  4, now() + interval '16 hours', 'open'),
  ('1fe7c0ca-8358-43e7-9385-56739a25e004', '7dc18629-1270-4c7f-a675-4f04053982e6', (select id from public.node_tiers where code = 'A'), 8, 96.00, 12, now() + interval '28 hours', 'open'),
  ('7718ef44-5046-42f2-b1b9-a6f3baac8b76', '4750ccd4-f7df-4320-a61a-5972c1b23b71', (select id from public.node_tiers where code = 'A'), 3, 20.00,  2, now() + interval '7 hours',  'open'),
  ('4b16cd62-cd54-4d01-ba5c-63b13a8378d2', '0abf522c-bc27-4d8b-b463-28f356779963', (select id from public.node_tiers where code = 'A'), 0, 144.00, 24, now() + interval '40 hours', 'open'),
  ('10df03e5-c908-4c90-8b32-ee03c946ef99', '9ef0eaa7-0c75-4839-9ef6-9ede8197a3a8', (select id from public.node_tiers where code = 'A'), 15, 88.00,  8, now() + interval '50 hours', 'open')
on conflict (id) do update
  set total_payout = excluded.total_payout,
      starts_at    = excluded.starts_at,
      status       = 'open';
