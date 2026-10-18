# Technical Plan

## Components

### Migration `supabase/migrations/0012_payouts.sql`
- `banks`: add `code text`, `currency text not null default 'NGN'`, `is_test boolean not null default false`; partial unique index on `code where code is not null`
- Seed `Test Bank (sandbox)` (`code 001`, `is_test = true`) — the picker hides it unless the secret key is `sk_test_`
- Rename legacy rows to Paystack names: `First Bank` → `First Bank of Nigeria`, `GTBank` → `Guaranty Trust Bank` (names only — `users.bank` / `withdrawals.bank` FKs stay valid)
- `users`: add `account_name text` (Paystack-verified)
- `withdrawals`: statuses become `pending | processing | paid | failed | declined`; `UPDATE ... SET status = 'paid' WHERE status = 'approved'`
- `payouts` table:
  - `id` uuid pk, `withdrawal_id` uuid → `withdrawals` (restrict), `user_id` uuid → `users` (restrict)
  - `reference` text not null **unique** — `payout_<uuid>`, 43 chars, `[a-z0-9-]`
  - `recipient_code` text, `transfer_code` text
  - `amount_usd` numeric > 0, `amount_kobo` bigint > 0, `rate` numeric > 0, `currency` text default `'NGN'`
  - `status` text default `'initialized'` check (`initialized`,`queued`,`otp_required`,`success`,`failed`,`reversed`)
  - `fee_charged` numeric, `failure_reason` text, `attempt` int default 1, `refunded_at` timestamptz
  - `created_at`, `updated_at` timestamptz default now()
  - indexes: `(withdrawal_id)`, `(reference)`, `(status)`
- `transfer_recipients` table: `id`, `user_id` → users, `bank_code`, `account_number`, `recipient_code`, `account_name`, `created_at`; unique `(user_id, bank_code, account_number)`
- `transactions`: type check gains `withdrawal_refund`
- Recreate `user_balances` so `withdrawal_refund` counts immediately (added to the immediate-credit branch)

### `lib/paystack.ts` (extend)
Server-only helpers, same throw-on-failure style as the existing ones:
- `paystackListBanks()` → `GET /bank?country=nigeria&currency=NGN` (returns all, no pagination needed)
- `paystackResolveAccount({ bankCode, accountNumber })` → `GET /bank/resolve`
- `paystackCreateRecipient({ name, accountNumber, bankCode })` → `POST /transferrecipient`
- `paystackInitiateTransfer({ amountKobo, recipient, reference, reason })` → `POST /transfer`
- `paystackFinalizeTransfer({ transferCode, otp })` → `POST /transfer/finalize_transfer`
- `paystackVerifyTransfer(reference)` → `GET /transfer/verify/:reference` (`status`, `fee_charged`, `failures`)
- `paystackGetBalance()` → `GET /balance`, returns the NGN entry in kobo
- `verifyPaystackSignature(rawBody, header)` → HMAC-SHA512 hex, `crypto.timingSafeEqual`
- Distinguish "API said no" from "Paystack unreachable" for the resolve fallback at approval

### Environment
```bash
PAYSTACK_MODE=test            # or "live"
PAYSTACK_SECRET_KEY_TEST=sk_test_…
PAYSTACK_SECRET_KEY_LIVE=sk_live_…
# PAYSTACK_SECRET_KEY still works as a single-key fallback
```
- Mode is explicit; the key set is chosen per mode and `requireSecretKey()` refuses a live key in test mode (and vice versa).
- `isTestMode()` / `paystackMode()` in `lib/paystack.ts` are the single source of truth (re-exported from `lib/banks.ts`).
- The same key drives deposits and node purchases — switching to live charges real cards for those flows too.

### Migration `supabase/migrations/0014_account_name_mode.sql`
- `users.account_name_mode` (`test | live`) records which mode verified the stored name
- An unchanged-destination save re-resolves when the stored mode differs, so a sandbox name can never be shown or paid against in live mode

### Migration `supabase/migrations/0013_sandbox_test_bank.sql`
- `banks.code` uniqueness becomes `where code is not null and not is_test`
- The sandbox test bank row moves to code `044` — Paystack test mode resolves `001` but refuses it for `POST /transferrecipient` ("Cannot resolve account"), while `044` is accepted

### `lib/banks.ts` (new)
- `isTestMode()` — `PAYSTACK_SECRET_KEY` starts with `sk_test_`
- `syncBanks()` — fetch list, filter `supports_transfer && active && !is_deleted && currency === 'NGN' && type === 'nuban'`, dedupe by name and by code (Paystack repeats 5 codes under two names), upsert into `banks` on `name` with `code`/`currency`, write `banks_synced_at` into `app_settings`
- `listBanks()` — sync when the catalogue has no coded rows or is > 24 h old, then read local rows; include the sandbox test bank row only when `isTestMode()` (259 live banks + 1 test = 260)
- `bankCodeFor(id)` — resolve a `banks.id` to its Paystack code

### `lib/payouts.ts` (new)
- `getOrCreateRecipient({ userId, bankCode, accountNumber, accountName })` — reuse from `transfer_recipients`, create once on miss
- `approveWithdrawal({ withdrawalId, adminId })` — the approval transaction:
  1. load request (`pending` only) + requester balance
  2. balance < amount → `declined` (+ "Insufficient balance")
  3. re-resolve name best-effort: explicit mismatch → 409 and stop; quota/transport error → continue with stored name
  4. `payout = round2(amount × 0.9)`, `kobo = round(payout × USD_TO_NGN × 100)`
  5. `paystackGetBalance()` NGN < kobo → 409, request stays `pending`
  6. get/create recipient
  7. insert `payouts` row (`initialized`, `attempt` = previous attempts + 1) **before** any Paystack call
  8. insert ledger `withdrawal` −amount (`status: 'processed'`), PATCH request → `processing`
  9. `paystackInitiateTransfer` → store `transfer_code`, set `queued` or `otp_required`; on error set `failed` + `failure_reason` (hold retained, admin can retry)
- `settlePayout(reference, source)` — shared by webhook and verify:
  - load payout; if already terminal → no-op
  - success → `success` + `fee_charged`, credit platform commission (+10% of request) via `platform_earnings`, request → `paid`
  - failed/reversed → `failed`/`reversed` + reason, insert `withdrawal_refund` +amount (full request), set `refunded_at`, request → `failed`; only when `refunded_at` is null
- `retryPayout(withdrawalId, adminId)` — only when request is `processing`, latest payout `failed`, `refunded_at` null; creates a new attempt

### API
- `GET /api/banks` — `{ banks: [{ id, name, code }] }` from `listBanks()` (auth as today)
- `GET /api/me` — adds `account_name` and `bank.code`
- `PATCH /api/me` — bank/account number handled as a pair: both present → resolve → store `account_name`; incomplete → 400; either cleared → clear both + `account_name`; resolve failure → 400
- `GET /api/withdraw/method` — adds `usd_to_ngn` (for the NGN preview); existing fields unchanged
- `POST /api/withdrawals` — require `users.account_name`; block when an active (`pending`/`processing`) request exists; snapshot bank, account number, verified name
- `GET /api/withdrawals` — new statuses + latest payout summary (`status`, `failure_reason`, `amount_usd`); newest first
- `POST /api/withdrawals/[id]/decision` — admin-only; approve delegates to `approveWithdrawal`; decline unchanged
- `POST /api/withdrawals/[id]/retry` — admin-only; delegates to `retryPayout`
- `POST /api/payouts/[id]/verify` — admin-only; `paystackVerifyTransfer` → `settlePayout`
- `POST /api/payouts/[id]/otp` — admin-only; `{ otp }` → `paystackFinalizeTransfer` → then verify/settle
- `POST /api/webhooks/paystack` — `await req.text()` raw body, signature check, parse, `settlePayout` for `transfer.*`, always `200` after a valid signature
- `GET /api/admin/withdrawals` — `?status=` gains `processing | paid | failed`; each row carries its latest payout (fetch payouts for the listed ids, newest first, map in code)

### UI
- `components/bank-select.tsx` — rewrite as a searchable Base UI `Combobox` over `{ id, name }` (a plain `Select` with 264 items is unusable); keeps the same `banks/value/onChange/id` props so the Me page change is small
- `components/me/me-client.tsx` — bank combobox + account number; save resolves and displays "Verified: NAME" read-only; disable save until both fields are valid; surface resolve errors; `account_name` no longer taken from the user's name
- `components/withdraw/withdraw-client.tsx` — show verified destination; NGN preview from `usd_to_ngn`; status labels Pending review / Processing / Paid / Failed (refunded) / Declined (+ reason); disable requesting when a request is active
- `components/admin/admin-transactions-client.tsx` — replace the (removed) mode toggle approach with:
  - approve confirmation dialog showing verified name, bank, account number, $ amount, ₦ amount, rate
  - payout status line per request (queued / OTP required / paid / failed + reason + fee)
  - actions: Check status (`/verify`), Retry (only for failed-without-refund), OTP input when `otp_required`
  - filters extended to `processing | paid | failed`
  - notices reflect queued vs paid (never claim "paid" on a queued transfer)

## API shapes
```
GET  /api/banks                    → { banks: [{ id, name, code }] }
GET  /api/me                       → { user: { …, account_name, bank: { id, name, code } | null } }
PATCH /api/me                      → { bank?, account_number? } → 200 { user } | 400
GET  /api/withdraw/method          → { mode, presets, policy, usd_to_ngn }
POST /api/withdrawals              → { amount } → 201 { withdrawal } | 400 | 409 (active request)
GET  /api/withdrawals              → { withdrawals: [{ …, status, payout: { status, failure_reason } | null }] }
POST /api/withdrawals/[id]/decision→ { action: "approve" | "decline" } → 200 | 404 | 409 | 409 (name mismatch / low float) | 502
POST /api/withdrawals/[id]/retry   → {} → 200 { withdrawal, payout } | 409
POST /api/payouts/[id]/verify      → {} → 200 { payout, withdrawal }
POST /api/payouts/[id]/otp         → { otp } → 200 { payout } | 400
POST /api/webhooks/paystack        → raw Paystack event → 200 | 401 (bad signature)
GET  /api/admin/withdrawals?status= → { withdrawals: [{ …, requester, payout }] }
```

## Data Model
```
banks            { id, name (unique), code?, currency }        ← catalogue synced from Paystack
users            { …, bank → banks?, account_number?, account_name? }
withdrawals      { id, user_id, amount, status: pending|processing|paid|failed|declined,
                   bank → banks?, account_number?, account_name?, reason?, created_at,
                   decided_at?, decided_by? }
payouts          { id, withdrawal_id, user_id, reference (unique), recipient_code?, transfer_code?,
                   amount_usd, amount_kobo, rate, currency, status,
                   fee_charged?, failure_reason?, attempt, refunded_at?, created_at, updated_at }
transfer_recipients { id, user_id, bank_code, account_number, recipient_code, account_name,
                   unique(user_id, bank_code, account_number) }
transactions     { …, type: …, withdrawal_refund }
```

## Flow
```
Me      → PATCH /api/me → /bank/resolve → users.account_name
Withdraw→ POST /api/withdrawals → withdrawals(pending) + destination snapshot
Admin   → POST /withdrawals/:id/decision
            → balance check → name re-check → GET /balance → recipient
            → payouts(initialized) → ledger withdrawal −amount → withdrawals(processing)
            → POST /transfer → payouts(queued|otp_required)
Paystack→ POST /webhooks/paystack | admin POST /payouts/:id/verify
            → settlePayout → success: commission +10%, withdrawals(paid)
                           → failed/reversed: withdrawal_refund, withdrawals(failed)
```

## Notes
- **Sandbox destination names are synthesized** (`SANDBOX TEST ACCOUNT`, no digits): test mode has no real accounts and caps live resolves at 3/day, so `PATCH /api/me` skips the Paystack call and `approveWithdrawal` skips the re-check. Live mode always resolves on both paths.
- **Paystack account prerequisite**: transfers are refused for a "starter business" ("You cannot initiate third party payouts as a starter business"). The Paystack business must be registered/completed before any payout can be delivered, in test or live mode. The engine handles the refusal correctly (payout `failed`, funds held, retry available).
- Ledger debit is booked at approval, so a user can never spend the funds mid-transfer; the refund ledger type keeps that reversible without mutating history.
- Commission is credited on success only: a payout that never happens must not earn the platform anything.
- `fail_charged` comes from `/transfer/verify`; the webhook payload also carries `data.fee` on some plans — prefer the verify value when available.
- Test mode caps live bank resolves at 3/day: resolve at save only, fall back to the stored name at approval, and use the sandbox test bank (`001`) for repeated E2E runs.
- Webhooks cannot reach localhost — the admin Check-status button is the dev confirmation path; deployed environments register the webhook URL in the Paystack dashboard.
- Postgres/PostgREST won't pick "latest payout" in an embed; fetch payouts for the listed withdrawal ids and map in code.
- No new npm dependencies (Base UI already ships `combobox`).
