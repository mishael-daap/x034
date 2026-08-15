# Business Rules

## Node Tiers
- Tier C (Standard): 4 vCPU / 16 GB, $10 equivalent. Purchasable on signup by any user.
- Tier B (Advanced): 8 vCPU / 32 GB, $25 equivalent. Unlocks with 10 direct referrals.
- Tier A (Top): 16 vCPU / 64 GB, $50 equivalent. Unlocks with 30 direct referrals.
- A user must purchase a node to count as a referral for someone else.
- A user can own nodes of multiple tiers.

## Referrals
- Direct referrals only (no multi-level tracking).
- A referral counts once the referred user purchases a node.
- Unlock thresholds: 10 referrals → tier B, 30 referrals → tier A.

## Jobs & Offers
- Jobs are tiered (A/B/C) and posted by companies (simulated in Phase 1).
- Each job has a pay rate per hour (set by the company), an estimated duration, and a fixed start time.
- Node owners browse available jobs and choose the best offer.

## Matching & Earnings
- A job requires a minimum node tier equal to its own tier.
- A node can only join a job of its own tier or lower.
- Earnings are always the job's pay rate × duration, regardless of node tier.
- A higher-tier node on a lower-tier job earns that job's tier pay (no bonus).

## Node Pool
- A node owner can add their node to a job's pool until 1 hour before the job starts.
- Once a job has started, nodes can no longer be added or removed.
- Nodes cannot be removed mid-job; removal is simply blocked (no penalty mechanic).

## Earnings & Balance
- Earnings are credited to the node owner's balance when the job completes.
- After completion, the node returns to available status.

## Withdrawals
- Withdrawal capacity is unlocked by referrals: each qualifying referral unlocks $5.
- Cap formula: withdrawals are allowed while (referrals × 5) ≥ (total withdrawn so far + requested amount).
- Check is cumulative — total withdrawn tracks across all past withdrawals, so the gate cannot be bypassed with repeated small withdrawals.

## Phase 1 Scope
- All companies, jobs, and node "work" are simulated.
- No real payments; test currency only.
