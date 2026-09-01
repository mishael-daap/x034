# Business Rules

## Node Tiers
- Tier C (Standard): 4 vCPU / 16 GB / 1 GPU / 1 Gbps, $10 equivalent.
- Tier B (Advanced): 8 vCPU / 32 GB / 2 GPU / 2 Gbps, $50 equivalent.
- Tier A (Top): 16 vCPU / 64 GB / 4 GPU / 4 Gbps, $100 equivalent.
- Any tier can be purchased by paying its price — no referral requirement to unlock tiers.
- A user must purchase a node to count as a referral for someone else.
- A user can own nodes of multiple tiers.

## Referrals
- Direct referrals only (no multi-level tracking).
- A referral counts once the referred user purchases a node.
- Referrals gate access to jobs that require n referrals (separate from the node tier requirement).
- Referrals do NOT gate tier purchases — all tiers are available to anyone who pays.

## Jobs & Offers
- Jobs are tiered (A/B/C) and posted by companies (simulated in Phase 1).
- Each job has a total payout (`total_payout`, the pot — set by the company), a total work amount (`duration_hours` — how long the job takes with one node), and a fixed start time.
- A job's total payout must be at least the platform earnings floor (so every single-node pool still satisfies the floor guarantee).
- Each job can require a minimum number of qualifying referrals (n) to unlock. This requirement is separate from the job's tier: a C, B, or A tier job can require any number of referrals.
- Node owners browse available jobs and choose the best offer.

## Matching & Earnings
- A job requires a minimum node tier equal to its own tier.
- A node can only join a job of its own tier or lower.
- To unlock a job, the node owner must meet its referral requirement (qualifying referrals ≥ n), independent of node tier matching.
- Both gates must be satisfied to join a job: node tier (equal or higher) and referral count (n or more).
- Every node in a job's pool earns `total_payout ÷ pool size` (the pot split), regardless of node tier.
- A higher-tier node on a lower-tier job earns that job's payout (no bonus).
- A job's total payout is constant and set by the company: the pot is split among the pool — more nodes = smaller share each, faster completion.
- The effective per-node hourly rate is derived (`total_payout ÷ duration_hours`) and is pool-independent; it is not shown to users. What varies with pool size: each node's total earnings (`total_payout ÷ pool size`) and the job's wall-clock duration (`duration_hours ÷ pool size`).

## Node Pool
- A node owner can add their node to a job's pool until the job stops accepting: at capacity, or 1 hour before the job starts, whichever comes first.
- Only node owners who meet the job's referral requirement can join its pool.
- A job is at capacity when the pool reaches `n_max = floor(total_payout ÷ platform floor)`. The platform floor is a platform-set minimum per-node earnings guarantee (not shown to users); jobs with `total_payout < platform floor` are not allowed.
- If a slot frees before the cutoff, the job becomes joinable again.
- Once a job has started, nodes can no longer be added or removed.
- Nodes cannot be removed mid-job; removal is simply blocked (no penalty mechanic).

## Earnings & Balance
- Each pool node's earnings (`total_payout ÷ pool size`) are credited when the job completes (`starts_at` + actual duration elapsed).
- After completion, the node returns to available status.

## Withdrawals
- A user can withdraw up to their available balance at any time.
- Withdrawals are not capped or gated by referrals.

## Phase 1 Scope
- All companies, jobs, and node "work" are simulated.
- No real payments; test currency only.
