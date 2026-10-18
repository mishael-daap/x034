# Feature: Paystack Bank Payouts (roadmap 6)

## Purpose
Make an approved withdrawal actually pay out to the user's bank account through Paystack Transfers, and replace the 4 seeded banks with the full catalogue Paystack supports. An approval is the only trigger: the admin reviews the request, confirms the verified account details, and the transfer fires immediately. Users never process their own money.

The account name is no longer typed by the user — it is resolved by Paystack and stored, so a transfer cannot fail on a name mismatch.

## User Flow
1. User opens **Me** → picks a bank from the full Paystack NGN list (searchable) and enters a 10-digit account number
2. Saving calls Paystack's account resolver; the verified name is shown read-only ("Verified: JOHN DOE") and stored on the profile
3. User opens **Withdraw** → sees the verified destination and, for the amount they type, the USD figure plus the NGN amount they will receive
4. Submitting creates a `pending` request with the destination snapshotted onto it (bank, account number, verified name)
5. Admin opens **Transactions** → sees the request with requester, verified name, bank, account number, $ amount, NGN amount, and the 10% commission preview
6. Admin taps **Approve** → a confirmation dialog repeats the verified name, the NGN amount and the rate; confirming fires the payout
7. The request moves to `processing` while Paystack delivers, then to `paid`
8. If the transfer fails or reverses, the request moves to `failed` and the full debit is refunded to the user's balance

## Rules

### Bank catalogue
- The dropdown lists every Paystack NGN bank with `supports_transfer = true`, `active = true`, `is_deleted = false` (264 of 289 at time of writing)
- Bank list is fetched from Paystack once and stored locally (`banks.code`, `banks.currency`); the UI reads the local table
- Sync runs when the local catalogue has no coded rows or the last sync is older than 24 h (timestamp in `app_settings`)
- Rows are upserted by `name`; the legacy 4 rows are renamed to Paystack names first ("First Bank" → "First Bank of Nigeria", "GTBank" → "Guaranty Trust Bank") so existing profile references survive
- The picker is searchable (264 entries is unusable as a plain list)
- A "Test Bank (sandbox)" entry (Paystack code `001`) is included **only** when the secret key starts with `sk_test_`; it resolves any 10-digit number to `TEST ACCOUNT <number>` and exists because test mode caps live bank resolves at 3 per day

### Account verification
- `PATCH /api/me` resolves bank + account number through `GET /bank/resolve` and stores the returned name in `users.account_name`
- A resolve failure blocks the save with a clear message; the user can never type their own account name
- Bank and account number are treated as a pair: setting one without the other completes it from stored values; clearing either clears both and `account_name`
- Account name is resolved at profile save only (never on page load — test-mode resolve quota)
- At approval the name is re-resolved best-effort: an explicit name mismatch blocks the payout (409); a quota/transport failure falls back to the stored verified name

### Withdrawal request
- Destination must exist and be verified before a request can be created
- Amount > 0 and ≤ available balance
- Only one active request per user (`pending` or `processing`)
- Destination + verified name are snapshotted on the `withdrawals` row at request time

### Approval and transfer
- Admin-only (`role = 'admin'`); the requester can never approve
- Balance is re-checked; if no longer covered the request is `declined` ("Insufficient balance")
- The user is debited **at approval** (ledger `withdrawal` −amount, `status: 'processed'`) so the money cannot be spent while the transfer is in flight; the request becomes `processing`
- Rate is the `USD_TO_NGN` constant, snapshotted per payout; payout = 90% of the request in USD, converted to kobo
- Paystack NGN balance is checked (`GET /balance`) before initiating; too low → 409, request stays `pending`, nothing moves
- Transfer recipient codes are reused per (user, bank code, account number) instead of re-created on every payout
- A `payouts` row (unique reference) is persisted **before** the Paystack call; every retry is a new attempt row, never a new reference for the same attempt
- `POST /transfer` success only means *queued* — never treated as paid
- `status: "otp"` moves the payout to `otp_required`; the admin can submit the OTP to finalize. The dashboard setting "Confirm transfers before sending" should be off

### Confirmation, fees and failure
- The webhook (`transfer.success` / `transfer.failed` / `transfer.reversed`) is the source of truth; each payout can also be checked on demand with `GET /transfer/verify/:reference`
- Signature is HMAC-SHA512 of the raw request body compared timing-safe against `x-paystack-signature`; processing is idempotent — a payout in a terminal state is never re-settled
- Platform commission (+10%) is credited only when the transfer confirms success (a payout that never happens must not earn commission)
- `fee_charged` is stored on the payout; the platform bears it — the user receives exactly 90% of the request
- `failed` / `reversed` → full debit refunded with a `withdrawal_refund` credit, `refunded_at` set, request `failed`
- A transfer that never queued (Paystack call errored) marks the payout `failed` locally; the debit is held and the admin can retry — no refund, since no money left

### Simulated payouts
- Removed. Every approval is a real Paystack transfer.

## Statuses (user-visible)
| status | label |
|---|---|
| `pending` | Pending review |
| `processing` | Processing |
| `paid` | Paid |
| `failed` | Failed — refunded to your balance |
| `declined` | Declined (+ reason) |

## Acceptance Criteria
- [ ] Migration 0012 applies cleanly; 0001–0011 untouched; existing `approved` rows become `paid`
- [ ] `/api/banks` returns the full transfer-capable NGN catalogue, searchable in the profile picker
- [ ] Legacy 4 banks are renamed, not duplicated; existing profile references still resolve
- [ ] Sandbox key exposes "Test Bank (sandbox)"; live key does not
- [ ] Saving a valid bank + 10-digit number stores the Paystack-verified name and shows it read-only
- [ ] An unresolvable account cannot be saved (400 with a clear message)
- [ ] A request without a verified destination is rejected
- [ ] Withdraw page shows the NGN amount the user will receive
- [ ] Approve: debit booked, request `processing`, payout row persisted, transfer queued
- [ ] Approve with verified-name mismatch → 409, no debit, request still `pending`
- [ ] Approve with low Paystack float → 409, request still `pending`
- [ ] `transfer.success` → payout `success`, `fee_charged` stored, platform commission +10%, request `paid`
- [ ] `transfer.failed` / `reversed` → full refund credits once, `refunded_at` set, request `failed`
- [ ] Duplicate webhooks / re-checks never double-credit or double-refund
- [ ] Admin can check status manually and retry a failed initiation
- [ ] `otp_required` payouts can be finalized from the admin UI
- [ ] The Paystack reference lives in `payouts`, not in `withdrawals.reason`
- [ ] Secret key stays server-side; typecheck + lint clean
- [ ] E2E in test mode: request → approve → paid; forced failure → refund
