# Tasks

## Migration
- [x] `0012_payouts.sql`: `banks.code` + `banks.currency` + `is_test`; rename legacy `First Bank` / `GTBank`; seed sandbox test bank
- [x] `0012`: `users.account_name`
- [x] `0012`: `withdrawals` statuses `pending | processing | paid | failed | declined`; legacy `approved` → `paid`
- [x] `0012`: `payouts` table (unique reference, amounts, rate, status, fee, failure reason, attempt, refunded_at)
- [x] `0012`: `transfer_recipients` table with unique `(user_id, bank_code, account_number)`
- [x] `0012`: `transactions` gains `withdrawal_refund`; recreate `user_balances` so refunds count immediately
- [x] `0013`: sandbox test bank settles through bank code `044` (Paystack rejects `001` for recipients); `code` uniqueness excludes test rows
- [x] Apply 0012 + 0013 to the hosted DB

## Paystack + bank catalogue
- [x] `lib/paystack.ts`: `paystackListBanks`, `paystackResolveAccount`, `paystackCreateRecipient`, `paystackInitiateTransfer`, `paystackFinalizeTransfer`, `paystackVerifyTransfer`, `paystackGetBalance`, `PaystackApiError`
- [x] `lib/paystack.ts`: `verifyPaystackSignature` (HMAC-SHA512 of raw body, timing-safe compare)
- [x] `lib/banks.ts`: `isTestMode`, `syncBanks` (filter `supports_transfer && active && !is_deleted`, dedupe by name/code, upsert by name, stamp `banks_synced_at`)
- [x] `lib/banks.ts`: `listBanks` (sync when empty/stale; sandbox row visible only in test mode)
- [x] `GET /api/banks` returns `{ id, name, code }` — 260 entries synced
- [x] Typecheck + lint clean

## Profile (Me page)
- [x] `PATCH /api/me`: bank + account number as a pair; resolve via Paystack (sandbox synthesizes `TEST ACCOUNT <number>`); store `users.account_name`; clear on removal; 400 on resolve failure; skip re-resolve when unchanged
- [x] `GET /api/me`: returns `account_name` and `bank.code`
- [x] `components/bank-select.tsx`: inline search over the full catalogue (no dropdown)
- [x] `components/me/me-client.tsx`: search picker, verified-name display, save gating, resolve error state
- [x] Typecheck + lint clean

## Withdrawal request
- [x] `GET /api/withdraw/method`: add `usd_to_ngn`
- [x] `POST /api/withdrawals`: require a verified destination, block a second active request, snapshot the verified name
- [x] `components/withdraw/withdraw-client.tsx`: verified destination, NGN preview, new status labels, disabled state while a request is active
- [x] Typecheck + lint clean

## Payout engine
- [x] `lib/payouts.ts`: `getOrCreateRecipient` (reuse per destination)
- [x] `lib/payouts.ts`: `approveWithdrawal` — balance check, destination re-check with quota fallback (skipped in sandbox), kobo math, Paystack float check, recipient, payout row before the API call, conditional claim, debit, initiate, `queued` / `otp_required`
- [x] `lib/payouts.ts`: `settlePayout` — idempotent success (fee + 10% commission + `paid`), failure/reversal (single refund + `failed`)
- [x] `lib/payouts.ts`: `retryPayout` (latest attempt failed and not refunded)
- [x] `POST /api/withdrawals/[id]/decision`: approve delegates to `approveWithdrawal`; decline unchanged
- [x] `POST /api/withdrawals/[id]/retry`: admin-only
- [x] `POST /api/payouts/[id]/verify`: admin-only → `paystackVerifyTransfer` → `settlePayout`
- [x] `POST /api/payouts/[id]/otp`: admin-only finalize → verify → settle
- [x] `POST /api/webhooks/paystack`: raw body, signature check, `transfer.*` → `settlePayout`, always 200 for valid signatures
- [x] Typecheck + lint clean

## Admin UI
- [x] `GET /api/admin/withdrawals`: new status filters + latest payout per request
- [x] `components/admin/admin-transactions-client.tsx`: approve confirmation dialog (verified name, bank, account, $ and ₦ amounts, rate)
- [x] Admin UI: payout status line per request (queued / OTP / paid / failed + reason + fee)
- [x] Admin UI: Check status, Retry (failed without refund), OTP input (when `otp_required`); filters `processing | paid | failed`
- [x] Notices never claim "paid" for a queued transfer
- [x] Typecheck + lint clean

## Verification
- [x] Bank sync populates the catalogue with codes; legacy 4 renamed, no duplicates
- [x] Sandbox key shows "Test Bank (sandbox)"; the picker searches by name
- [x] Saving the sandbox bank + any 10 digits stores `TEST ACCOUNT <number>` and displays it
- [ ] Unresolvable live account is rejected at save (needs a live key)
- [ ] Request → approve → payout `queued` → Check status → `paid`; balance drops once; commission credited once — **blocked: Paystack rejects third-party payouts for a "starter business"**
- [x] Approval path verified up to the Paystack call: balance check → recipient → payout row → claim → debit → initiate; failure leaves the request `processing`, funds held, payout `failed`
- [x] Retry after an initiation error reuses the hold and creates `attempt 2` (no second debit)
- [ ] Name mismatch at approval → 409 (needs a live key or a working sandbox transfer)
- [ ] Low Paystack float → 409 (sandbox float is funded)
- [ ] Failed transfer → single refund, balance restored (needs a transfer that Paystack accepts)
- [ ] Duplicate webhook / repeated Check status → no double credit or refund
- [ ] Second request while one is active → blocked
- [ ] Non-admin hits decision / retry / verify / otp → 403
- [x] `ai/business-rules.md` updated for payout states, refunds, fee bearer, commission-on-success
- [ ] Typecheck + lint + `next build` clean (final pass)
- [ ] Roadmap item 6 → completed after a successful sandbox transfer
