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
Status: completed
Goal: Split withdrawal *requests* from *executed* money movement. A request is a row in a new `withdrawals` table (`pending`); an approver (the platform admin — a `role = 'admin'` user who signs in through the normal login; admin UI is roadmap 5.2) flips it to `approved` or `declined`. Only an approval creates the ledger `withdrawal` transaction (−amount, `status: processed`), so balances drop at approval time and users never process their own withdrawals (the user-facing "Process" button is removed). Balance is re-checked at approval and the request is declined if it's no longer covered. The platform user becomes the admin account (real credentials, `role = 'admin'`), and the decision endpoint is admin-gated from the start.

Scope:
- Migration 0009: `withdrawals` table — `user_id`, `amount` (positive), status `pending | approved | declined`, `reason`, `created_at`, `decided_at`, `decided_by` (→ users, filled on decision), destination snapshot (`bank` → banks, `account_number`, `account_name`)
- Migration 0009: legacy migration — existing `transactions` rows `type='withdrawal' & status='pending'` move to `withdrawals` as `pending` (their ledger rows are deleted; they never affected balances); `processed` ledger rows stay as history
- Migration 0009: admin identity — `users.role` (`user` | `admin`, default `user`); platform row (`PLATFORM_USER_ID`) gets `role = 'admin'` and a real scrypt password (dev one-off, app-side hash — not embeddable in SQL) so it signs in at `platform@x034.local` like any user
- Profile (Me page) rebuild: editable name, email, phone, bank + account number (`PATCH /api/me`); `GET /api/banks`; destination snapshot read from the profile at request time; no referral-code card / withdraw / referrals buttons / sign-out on Me (dashboard covers those)
- `POST /api/withdrawals`: create a request — amount > 0, ≤ available balance, profile account details present
- `GET /api/withdrawals`: the signed-in user's requests (pending/approved/declined), newest first
- `POST /api/withdrawals/[id]/decision` — **admin-gated** (`role = 'admin'`, 403 otherwise): `pending → approved` only — re-check `user_balances` ≥ amount, else `declined` (reason "Insufficient balance"); on approval insert the ledger row (`type: withdrawal`, −amount, `status: processed`) and set `decided_at`/`decided_by`; decline sets optional `reason`; retry-safe (failed insert leaves it `pending`)
- Withdraw page: remove the "Process" control; list requests from `GET /api/withdrawals` with status badge + decline reason; show saved destination with change link; live remaining-balance preview stays
- Dashboard referral cards link to `/referrals` (keeps it reachable after the Me rebuild); no admin UI in this item (that's 5.2)

## 5.2 Admin Platform UI (incremental)
Status: pending
Goal: Give the platform admin (a `role = 'admin'` user, signed in via the normal login — see 5.1) a dedicated mobile-first area at `/admin` with its own bottom bar (Dashboard + Withdrawals). Dashboard shows platform-wide metrics; Withdrawals is the review queue where pending requests are approved or declined (consuming the admin-gated decision endpoint from 5.1). Non-admin users are redirected away from `/admin`.

Scope:
- `GET /api/admin/stats` (admin-gated): total users, total nodes, platform balance, lifetime platform revenue (`node_sale` + `platform_earnings`), pending withdrawal count, total payout requested (Σ pending `withdrawals.amount`), open jobs
- `GET /api/admin/withdrawals` (admin-gated): all requests with requester (name/email) + destination snapshot; `?status=` filter (default pending first)
- Admin app shell: `/admin` layout with bottom bar — Dashboard + Withdrawals only (mirrors the user shell)
- `/admin` dashboard: metric tiles from stats
- `/admin/withdrawals`: request list (amount, requester, destination, created) with Accept / Decline secondary buttons — green accept, red decline (decline prompts for an optional reason); consumes `POST /api/withdrawals/[id]/decision`; list refreshes after each decision
- Guards: `/admin/*` routes require `role = 'admin'` (redirect to `/` otherwise); the platform admin keeps access to the normal user app

## 6. Bank Payouts via Paystack Transfers (real withdrawals)
Status: pending (brainstorming — no spec yet)
Goal: Make an approved withdrawal actually pay out to the user's bank account, and let users pick from the **full set of banks Paystack supports** rather than the 4 seeded ones. A partial implementation already exists (`lib/paystack.ts` `paystackCreateRecipient`/`paystackInitiateTransfer`; admin `mode: simulated | paystack` toggle in `POST /api/withdrawals/[id]/decision`; Paystack reference in `ai/dependencies/paystack/transfers.md`), but it is capped by a hardcoded 4-bank name→code map, no account-name verification, no persisted transfer record, no webhook reconciliation, and it books the ledger as `processed` at queue time. This item completes the loop.

Known gaps to close:
- **Bank catalogue**: `/api/banks` reads the seeded `banks` table (First Bank, Zenith, GTBank, Access) and `lib/paystack.ts` hardcodes `BANK_CODE_BY_NAME` for only those names. Fetch the live list from `GET /bank?country=nigeria&currency=NGN` (cached) and store/select any supported bank with its Paystack `code`.
- **Account verification**: users currently type `account_name` by hand. Use `GET /bank/resolve?account_number=&bank_code=` at profile save (and again before payout) so the name is Paystack-verified and transfers don't fail on mismatch.
- **Recipient reuse**: persist the `recipient_code` (RCP_…) per user/destination instead of re-creating it on every payout.
- **Transfer record + idempotency**: persist each payout (unique reference, amount kobo, recipient_code, Paystack `transfer_code`, status, failure reason) before calling Paystack; today the reference only lives as free text in `withdrawals.reason`. Retry by verifying the reference, never by re-sending a new one.
- **Status lifecycle + webhooks**: add `POST /api/webhooks/paystack` verifying `x-paystack-signature` (HMAC-SHA512 of the raw body), handling `transfer.success` / `transfer.failed` / `transfer.reversed`, idempotently. A `POST /transfer` success only means *queued*; the ledger must not be treated as final until the webhook (or a verify poll) confirms.
- **Failure/refund path**: if a transfer fails or reverses, restore the user's balance (or leave the request pending) instead of losing the money.
- **Payment mode**: decide whether `paystack` becomes the only real payout mode (keeping `simulated` for local/dev) and whether the admin picks per request or the platform does.

Open questions (to settle before a spec):
1. **Currency/rate**: balances are USD, Paystack pays NGN. Is Paystack USD payout available on the account, or do we convert at a rate? If converting, where does the live rate come from (the hardcoded `USD_TO_NGN = 1400` is sandbox-only) and does the user see the NGN figure before confirming?
2. **Bank scope**: Nigeria NGN NUBAN only for now, or also Ghana (GHIPSS), Kenya (mobile money), South Africa? Each adds a transfer `type` and different validation.
3. **OTP**: disable the Transfers OTP requirement (needed for programmatic/bulk payouts) or handle `status: "otp"` via `POST /transfer/finalize_transfer`?
4. **Who bears the Paystack fee** (`fee_charged`) — the platform's 10% commission, the user's payout, or unchanged?
5. **Manual review**: admin approval stays the single human gate, or add a second confirmation showing the verified account name and NGN amount before the transfer fires?
6. **Balance check**: read Paystack's `GET /balance` before initiating, and what to do when the Paystack balance is too low.
7. **Verification source of truth**: webhook only, or also poll `GET /transfer/verify/:reference` for requests never confirmed (webhooks can be missed locally)?
8. **Failure UX**: what the requesting user sees while a payout is `queued` / `otp` / `failed` / `reversed` on `/withdraw` and in transaction history.
