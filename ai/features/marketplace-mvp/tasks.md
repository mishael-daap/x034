# Tasks

- [x] Migration 0003: add 'purchase' to transactions type check
- [x] Update user_balances view: elapsed-time conditional on actual_duration_hours (JOIN assignment → job)
- [x] Seed: `supabase/seed.sql` (node_tiers, banks, companies, jobs)
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
