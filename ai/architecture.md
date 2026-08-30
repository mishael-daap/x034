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
Job created (seed script) → matching engine admits eligible nodes to the pool → pool locks at start time (capacity or cutoff) → job completes → each pool node's earnings credited to balance → withdrawal

## Core Entities
- User — referral code (balance via user_balances view)
- Company — simulated company posting jobs
- Job — tier, pay/hr (set by company), duration, start time, required referrals (n) to unlock, company
- Node — tier, owner, specs (from tier), availability state
- NodeTier — C/B/A: vCPU, RAM, GPU, bandwidth (Gbps), price (seeded entity)
- Assignment — node + job lifecycle: committed → active → completed; locks at start; actual duration = duration_hours ÷ pool size; earnings derived (pay × actual duration)
- Referral (tracked via users.referrer) — direct only; qualifies when referee purchases a node
- Transaction — balance ledger (type: earnings/withdrawal, signed amount, status for withdrawals)

## Key Decisions
- Auth: Supabase Auth
- Jobs and node tiers simulated/seeded in Phase 1; no real compute
- Job pay rates are set by the company (client) when creating a job
- Matching: node tier must meet or exceed job tier; jobs also have an independent referral requirement (n qualifying referrals) to unlock
- Earnings: pay rate × actual duration (duration_hours ÷ pool size), regardless of node tier (no bonus for higher-tier nodes); a job's total pot is constant
- Node pool: many nodes per job; admits until capacity (platform earnings floor) or 1 hour before start; reopens on freed slots; locked at start
- Referrals: direct only, tracked by referral code; gate access to jobs with a referral requirement (not tier purchases)
- Money: test currency only in Phase 1; payments are a Phase 2 decision
- Mobile-first: designed and optimized for mobile devices; UI should feel like a native mobile application

## Development Policy
- Build as lean as possible: implement the bare minimum needed, write less than we need.
- Adding something later is okay and preferred — prefer additive changes (new tables, columns, indexes, policies, triggers) that never require removing or restructuring existing things.
- Removing something later is painful — avoid speculative features, constraints, and enforcement that can be deferred.
- If a rule or check can be enforced in the app layer instead of the database, do that first; move it into the database only when it earns its place.

## Constraints
- Must use Next.js + Supabase, hosted on Vercel
- Mobile-first: app must be optimized for mobile devices and feel like a native mobile application
- No real money or real compute in Phase 1
- Node cannot be added to or removed from a job once it has started
