# Roadmap

Agile, MVP-first: each item is a shippable increment; build the core loop to v1 as fast as possible, then iterate to improve.

## 1. Data Model & Migration
Status: completed
Goal: Schema + Supabase migration for all core tables and the user_balances view

## 2. Auth & Onboarding
Status: completed
Goal: Signup, login, profile with referral code, and node purchase (any tier)

## 3. Marketplace MVP (core earning loop)
Status: pending
Goal: Seeded companies and jobs, browse jobs, commit nodes to a job pool, credit earnings on completion, show balance

## 3.1 Pot Model (incremental)
Status: completed
Goal: Replace `jobs.pay_per_hour` with a company-set `total_payout` pot (derived per-node earnings, pool-based capacity, `total_payout ≥ platform floor`) so the schema matches business rules

## 4. Referrals & Withdrawals
Status: pending
Goal: Referral tracking with referral-gated job unlocks, and the withdrawal flow using test currency
