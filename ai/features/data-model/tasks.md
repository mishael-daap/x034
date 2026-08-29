# Tasks

- [ ] Fetch + save Supabase docs to ai/dependencies/supabase/docs.md
- [ ] Create Supabase project + connect CLI, add env vars
- [ ] Write migration: tables in FK order (banks, companies, node_tiers, users, nodes, jobs, assignments, transactions, withdrawals)
- [ ] Add indexes + constraints (unique referral_code, partial unique on assignment, referrer ≠ self, referrer-immutability trigger)
- [ ] Add RLS policies (owner-only vs public)
- [ ] Write seed: node_tiers C/B/A + banks
- [ ] Run migration + seed, verify schema/constraints with SQL
- [ ] Update roadmap.md item 1 → completed
