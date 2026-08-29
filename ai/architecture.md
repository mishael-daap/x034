# Architecture

## Stack
- Frontend: Next.js (user app)
- Backend: Next.js API routes / server actions
- Database: Supabase (Postgres) + Supabase Auth
- Hosting: Vercel

## System Structure
- User app — signup, node purchase, marketplace, node pool, balance, referrals
- API layer — app logic: matching, node pool locking, earnings, referrals
- Database — users, companies, node tiers, nodes, jobs, assignments, referrals, transactions
- Job simulation — simulated companies/jobs via seed scripts

## Data Flow
User → Frontend → API → Database
Job created (seed script) → matching engine selects eligible nodes → node pool locks at start time → job completes → earnings credited to balance → withdrawal

## Core Entities
- User — referral code (balance via user_balances view)
- Company — simulated company posting jobs
- Job — tier, pay/hr (set by company), duration, start time, required referrals (n) to unlock, company
- Node — tier, owner, specs (from tier), availability state
- NodeTier — C/B/A: vCPU, RAM, GPU, bandwidth (Gbps), price (seeded entity)
- Assignment — node + job lifecycle: committed → active → completed; locks at start; duration on job, earnings derived (pay × duration)
- Referral (tracked via users.referrer) — direct only; qualifies when referee purchases a node
- Transaction — balance ledger (type: earnings/withdrawal, signed amount, status for withdrawals)

## Key Decisions
- Auth: Supabase Auth
- Jobs and node tiers simulated/seeded in Phase 1; no real compute
- Job pay rates are set by the company (client) when creating a job
- Matching: node tier must meet or exceed job tier; jobs also have an independent referral requirement (n qualifying referrals) to unlock
- Earnings: always the job's pay rate, regardless of node tier (no bonus for higher-tier nodes)
- Node pool: commit allowed until 1 hour before start; locked at start
- Referrals: direct only, tracked by referral code; gate access to jobs with a referral requirement (not tier purchases)
- Money: test currency only in Phase 1; payments are a Phase 2 decision
- Mobile-first: designed and optimized for mobile devices; UI should feel like a native mobile application

## Constraints
- Must use Next.js + Supabase, hosted on Vercel
- Mobile-first: app must be optimized for mobile devices and feel like a native mobile application
- No real money or real compute in Phase 1
- Node cannot be added to or removed from a job once it has started
