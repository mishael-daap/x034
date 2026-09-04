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

## 5. Paystack Node Payments
Status: pending
Goal: Fund node purchases with real (test-mode) card payments via Paystack. Display stays in USD; Paystack charges NGN at a fixed sandbox rate (1 USD = 1400 NGN). Flow: purchase page initializes a Paystack transaction → user pays on Paystack's hosted page → callback verifies server-side → buyer gets a `funding` credit → the existing (unchanged) purchase split runs (node + buyer debit + platform/referrer credits). Signup requires both email and phone so every buyer has a Paystack customer email.

Scope:
- Migration 0007: `payments` table (user, tier, unique `reference`, amount, currency, status initialized→success); add `funding` transaction type; recreate `user_balances` so `funding` counts immediately
- `lib/constants.ts`: `USD_TO_NGN = 1400` (fixed sandbox rate; live rate API deferred)
- `POST /api/nodes/purchase`: initialize Paystack transaction — amount = round(price × 1400 × 100) kobo, `currency: NGN`, `metadata: { tierId, userId }`, `callback_url` — and return `authorization_url` (client redirects); card purchases no longer gated on available balance
- Callback page (`/nodes/purchase/complete`) + server verify: unique-`reference` idempotency guard; check `data.status === "success"`, amount, and metadata vs the signed-in session; then write the `funding` +P credit and run the existing purchase split (buyer −P, platform `node_sale` +0.5P / `platform_earnings` +0.2P, referrer `referral` +0.3P when referred)
- Purchase page UI states: initializing → redirect to Paystack; callback: verifying → success (→ /nodes) or error + retry
- Signup: email AND phone both required (route + form); login unchanged
- No ledger-UI label changes needed (`funding` rows show only in balances; full transaction history is not rendered anywhere today)
- Paystack API docs captured in `ai/dependencies/paystack/doc.md`
- E2E (test mode): card purchase books node + reconciling rows; duplicate/retried callback does not double-credit; legacy phone-only accounts get a clear error at init

## 5.1 Admin-Approved Withdrawals (incremental)
Status: pending
Goal: Split withdrawal *requests* from *executed* money movement. A request is a row in a new `withdrawals` table (`pending`); an approver (the platform admin — logs in as a regular user; admin auth/UI deferred) flips it to `approved` or `declined`. Only an approval creates the ledger `withdrawal` transaction (−amount, `status: processed`), so balances drop at approval time and users never process their own withdrawals (the user-facing "Process" button is removed). Balance is re-checked at approval and the request is declined if it's no longer covered.

Scope:
- Migration 0009: `withdrawals` table — `user_id`, `amount` (positive), status `pending | approved | declined`, `created_at`, `decided_at`, `decided_by` (→ users, filled on decision), destination snapshot (bank, account number — pending bank-details decision)
- Migration 0009: legacy migration — existing `transactions` rows `type='withdrawal' & status='pending'` move to `withdrawals` as `pending` (their ledger rows are deleted; they never affected balances); `processed` ledger rows stay as history
- `POST /api/withdrawals`: create a request — amount > 0 and ≤ available balance
- `GET /api/withdrawals`: the signed-in user's requests (pending/approved/declined), newest first
- Approval endpoint (admin gating + UI deferred; dev-usable): `pending → approved` only — re-check `user_balances` ≥ amount, else `declined`; on approval insert the ledger row (`type: withdrawal`, −amount, `status: processed`) and set `decided_at`/`decided_by`; retry-safe (failed insert leaves it `pending`)
- Withdraw page: remove the "Process" control; list requests from `GET /api/withdrawals` with status badge; live remaining-balance preview stays
- Bank/account details collection — location TBD (profile vs request-time); no admin UI in this item
