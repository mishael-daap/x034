# Overview

## Product
A two-sided compute marketplace web app. Node owners purchase a node tier and earn by committing their node to paid compute jobs posted by companies. Phase 1 is a sandbox simulation: companies and jobs are simulated, no real money is involved, and all balances are test currency.

## Target Users
- Node owners (individuals) who want to earn money by renting out compute capacity. They are the only real users in Phase 1.
- Companies with computational tasks are simulated for testing purposes.

## Problem
Individuals with compute capacity have no easy way to monetize it, and companies with bursty compute needs lack flexible capacity. Phase 1 validates the marketplace model (matching, scheduling, tiering, payout flow) before any real compute or payments are connected.

## Core Features
- Signup and node purchase (tier C available on signup)
- Tiered node system (C = entry tier; B and A unlocked via referrals; rules in business-rules.md)
- Compute marketplace with simulated jobs (pay per hour, duration, start time)
- Node pool: commit a node to a job up to 1 hour before start; locked once started
- Earnings credited to balance when a job completes
- Referral system (direct referrals only) and referral-gated withdrawals
- Simulated companies and jobs via seed scripts

## Constraints
- Phase 1 only: sandbox simulation, test currency, no real payments
- Companies, jobs, and node "work" are entirely simulated
- Next.js + Supabase stack, hosted on Vercel
