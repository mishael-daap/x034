# Roadmap

Agile, MVP-first: each item is a shippable increment; build the core loop to v1 as fast as possible, then iterate to improve.

## 1. Data Model & Migration
Status: completed
Goal: Schema + Supabase migration for all core tables and the user_balances view

## 2. Auth & Onboarding
Status: completed
Goal: Signup, login, profile with referral code, and node purchase (any tier)

## 3. Marketplace MVP (core earning loop)
Status: completed
Goal: Seeded companies and jobs, browse jobs, commit nodes to a job pool, credit earnings on completion, show balance

## 3.1 Pot Model (incremental)
Status: completed
Goal: Replace `jobs.pay_per_hour` with a company-set `total_payout` pot (derived per-node earnings, pool-based capacity, `total_payout ≥ platform floor`) so the schema matches business rules

## 4. Referrals & Withdrawals
Status: completed (job-unlock referral gating remains display-only — enforcement deferred)
Goal: Referral tracking with referral-gated job unlocks, and the withdrawal flow using test currency

## 4.1 Revenue & Commission Model (incremental)
Status: pending
Goal: Make the platform and referrers earn on every node purchase — 30% referral commission, 20% platform cut, 50% node-sale proceeds, no-referrer share defaulting to the platform — recorded as reconciling ledger rows at purchase time, with the platform as a real actor (seeded user) and deposits removed.

Scope:
- Migration 0006: add `referral` / `platform_earnings` / `node_sale` transaction types, drop `deposit`; seed the platform user (`PLATFORM_USER_ID`); recreate `user_balances` (new credits immediate, no deposit term)
- `POST /api/nodes/purchase`: balance gate (no negative balances) + idempotent multi-row write (buyer debit, node sale, platform cut, referral if referred)
- Deposit feature removed: `/api/deposits` route + dashboard deposit UI
- Platform balance/history and referral commission history surfaced in the UI
- Business rules updated in `ai/business-rules.md`
