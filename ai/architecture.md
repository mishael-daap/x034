# Architecture

## Stack
- Frontend: Next.js (user app)
- Backend: Next.js API routes / server actions
- Database: Supabase (Postgres) + Supabase Auth
- Hosting: Vercel

## System Structure
- User app — signup, node purchase, marketplace, node pool, balance, referrals
- API layer — app logic: matching, node pool locking, earnings, referrals
- Database — users, companies, node tiers, nodes, jobs, assignments, referrals, transactions, withdrawals
- Job simulation — simulated companies/jobs via seed scripts

## Data Flow
User → Frontend → API → Database
Job created (seed script) → matching engine selects eligible nodes → node pool locks at start time → job completes → earnings credited to balance → withdrawal (referral-gated)

## Core Entities
- User — referral code, balance, tier unlocks
- Company — simulated company posting jobs
- Job — tier, pay/hr (set by company), duration, start time, company
- Node — tier, owner, specs (from tier), availability state
- NodeTier — C/B/A: vCPU, RAM, price, referrals required (seeded entity)
- Assignment — node + job lifecycle: committed → active → completed; locks at start; records actual duration + earnings at completion
- Referral — referrer → referee; qualifies when referee purchases a node
- Transaction — balance ledger (earnings in, withdrawals out)
- Withdrawal — amount, status, gate check

## Key Decisions
- Auth: Supabase Auth
- Jobs and node tiers simulated/seeded in Phase 1; no real compute
- Job pay rates are set by the company (client) when creating a job
- Matching: node tier must meet or exceed job tier; earnings are always the job's pay rate (no bonus for higher-tier nodes)
- Node pool: commit allowed until 1 hour before start; locked at start
- Referrals: direct only, tracked by referral code
- Money: test currency only in Phase 1; payments are a Phase 2 decision

## Constraints
- Must use Next.js + Supabase, hosted on Vercel
- No real money or real compute in Phase 1
- Node cannot be added to or removed from a job once it has started
