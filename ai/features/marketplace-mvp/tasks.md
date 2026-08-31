# Tasks

<<<<<<< HEAD
- [ ] Migration 0002: add 'purchase' to transactions type check
- [ ] Update user_balances view: elapsed-time conditional (JOIN assignment → job)
- [x] Seed companies + sample jobs (varied tiers, start times, durations, pay)
- [ ] Marketplace job list page (mobile-first)
- [ ] Job detail page with derived status display
- [ ] Node purchase page (/nodes/purchase) + "Purchase node" entry from job detail
- [ ] purchaseNode action (create node + 'purchase' transaction)
- [ ] My nodes page
- [ ] commitNode action with checks (ownership, tier, window, elapsed-based availability)
- [ ] lockAndEarn action (assignment → active + earnings transaction at lock)
- [ ] End-to-end verification of the loop
=======
- [x] Migration 0003: add 'purchase' to transactions type check
- [x] Update user_balances view: elapsed-time conditional on actual_duration_hours (JOIN assignment → job)
- [ ] Seed: `supabase/seed.sql` (node_tiers, banks, companies, jobs) — deferred; hosted DB already populated ad hoc; jobs must satisfy pay × duration ≥ floor
- [x] `GET /api/marketplace` — job list endpoint (public; pool counts)
- [x] `GET /api/marketplace/[jobId]` — job detail endpoint (public; pool count + live per-node estimate)
- [ ] `GET /api/nodes` — my nodes + balance endpoint (auth)
- [ ] `POST /api/nodes/purchase` — purchaseNode (create node + 'purchase' transaction)
- [x] Marketplace job list page (mobile-first)
- [x] Job detail page with derived status display
- [x] Node purchase page (/nodes/purchase) + "Purchase node" entry from job detail
- [x] My nodes page
- [ ] `POST /api/marketplace/[jobId]/commit` — commitNode with checks (ownership, tier, window, elapsed-based availability, pool below capacity)
- [ ] `POST /api/marketplace/[jobId]/lock` — lockAndEarn (fill actual_duration_hours, assignments → active, earnings transaction per pool node at lock)
- [ ] End-to-end verification of the loop (single + multi-node pool)
>>>>>>> 134df42895c5103a2550fb090d883a1027c37ef6
