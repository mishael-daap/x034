# Business Rules

## Node Tiers
- Tier C (Standard): 4 vCPU / 16 GB, $10 equivalent.
- Tier B (Advanced): 8 vCPU / 32 GB, $25 equivalent.
- Tier A (Top): 16 vCPU / 64 GB, $50 equivalent.
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
- Each job has a pay rate per hour (set by the company), an estimated duration, and a fixed start time.
- Each job can require a minimum number of qualifying referrals (n) to unlock. This requirement is separate from the job's tier: a C, B, or A tier job can require any number of referrals.
- Node owners browse available jobs and choose the best offer.

## Matching & Earnings
- A job requires a minimum node tier equal to its own tier.
- A node can only join a job of its own tier or lower.
- To unlock a job, the node owner must meet its referral requirement (qualifying referrals ≥ n), independent of node tier matching.
- Both gates must be satisfied to join a job: node tier (equal or higher) and referral count (n or more).
- Earnings are always the job's pay rate × duration, regardless of node tier.
- A higher-tier node on a lower-tier job earns that job's tier pay (no bonus).

## Node Pool
- A node owner can add their node to a job's pool until 1 hour before the job starts.
- Only node owners who meet the job's referral requirement can join its pool.
- Once a job has started, nodes can no longer be added or removed.
- Nodes cannot be removed mid-job; removal is simply blocked (no penalty mechanic).

## Earnings & Balance
- Earnings are credited to the node owner's balance when the job completes.
- After completion, the node returns to available status.

## Withdrawals
- A user can withdraw up to their available balance at any time.
- Withdrawals are not capped or gated by referrals.

## Phase 1 Scope
- All companies, jobs, and node "work" are simulated.
- No real payments; test currency only.
