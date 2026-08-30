# Feature: Marketplace MVP (Core Earning Loop)

## Purpose
Deliver the core earning loop: browse compute jobs, purchase a node when you lack one for a job's tier, commit your node to a job, and see the job lifecycle — status derived from start time + duration — with earnings counted in the balance via the time-aware `user_balances` view.

## User Flow
1. User opens the marketplace → list of open jobs (company, tier, pay/hr, duration, starts_at, referral requirement)
2. User taps a job → job detail page
3. If the user owns no node meeting the job's tier → detail shows a "Purchase node" button
4. Tapping it → node purchase page (`/nodes/purchase`, pick a tier) → purchase
5. Back on the job, the user commits their node (allowed until 1 hour before start)
6. UI derives and shows job status from `starts_at` + `duration_hours` vs now: upcoming → commit window → in progress (locked) → completed
7. At lock (job start), the earnings transaction is created (amount = `pay_per_hour × duration_hours`). The balance view includes it once `starts_at + duration_hours` has elapsed; before that it shows as pending in transaction history

## Rules
- Marketplace is browsable without owning a node (soft gate); only committing requires a qualifying node
- Qualifying node = tier ≥ job tier (matching rule); referral requirement is display-only in the MVP (enforced in item 4)
- Commit allowed until 1h before `starts_at`; locked at start; no removal after start
- App-enforced: one committed/active assignment per node, one worker per job
- Job status and node availability are **derived from time**, not stored status: a node is occupied only while its assignment's job has not elapsed (`starts_at + duration_hours > now()`)
- Earnings transaction created at lock; amount = `pay_per_hour × duration_hours` (planned duration — jobs never actually run in Phase 1)
- Balance via `user_balances` view: earnings count only when the job has elapsed; purchases and withdrawals count immediately
- Node purchases are allowed regardless of balance in Phase 1 (test currency; balance may go negative)
- Purchases are recorded as transaction type `'purchase'` (debit)

## Acceptance Criteria
- [ ] User without a node can browse marketplace + job details
- [ ] Job detail shows "Purchase node" when user lacks a qualifying node
- [ ] Purchasing creates the node (visible under user's nodes) + a `'purchase'` transaction
- [ ] User can commit a qualifying node to a job within the window
- [ ] UI shows correct derived status: upcoming / commit window / in progress / completed
- [ ] Earnings transaction created at lock; balance shows it only after `starts_at + duration_hours` has elapsed
- [ ] After elapsed time, the node is available and can be recommitted (no background process)
