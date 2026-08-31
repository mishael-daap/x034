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
- Each job has a pay rate per hour (set by the company), a total work amount (`duration_hours` — how long the job takes with one node), and a fixed start time.
- Each job can require a minimum number of qualifying referrals (n) to unlock. This requirement is separate from the job's tier: a C, B, or A tier job can require any number of referrals.
- Node owners browse available jobs and choose the best offer.

## Matching & Earnings
- A job requires a minimum node tier equal to its own tier.
- A node can only join a job of its own tier or lower.
- To unlock a job, the node owner must meet its referral requirement (qualifying referrals ≥ n), independent of node tier matching.
- Both gates must be satisfied to join a job: node tier (equal or higher) and referral count (n or more).
- Every node in a job's pool earns: pay rate × actual duration (`duration_hours ÷ pool size`), regardless of node tier.
- A higher-tier node on a lower-tier job earns that job's tier pay (no bonus).
- A job's total payout is constant: pay rate × `duration_hours` (the pot is split among the pool — more nodes = smaller share each, faster completion).

## Node Pool
- A node owner can add their node to a job's pool until the job stops accepting: at capacity, or 1 hour before the job starts, whichever comes first.
- Only node owners who meet the job's referral requirement can join its pool.
- A job is at capacity when the pool reaches `n_max = floor(pay rate × duration_hours ÷ platform floor)`. The platform floor is a platform-set minimum per-node earnings guarantee (not shown to users).
- If a slot frees before the cutoff, the job becomes joinable again.
- Once a job has started, nodes can no longer be added or removed.
- Nodes cannot be removed mid-job; removal is simply blocked (no penalty mechanic).

## Earnings & Balance
- Each pool node's earnings (pay rate × actual duration) are credited when the job completes (`starts_at` + actual duration elapsed).
- After completion, the node returns to available status.

## Withdrawals
- A user can withdraw up to their available balance at any time.
- Withdrawals are not capped or gated by referrals.

## Phase 1 Scope
- All companies, jobs, and node "work" are simulated.
- No real payments; test currency only.
