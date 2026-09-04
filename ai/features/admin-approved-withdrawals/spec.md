# Feature: Admin-Approved Withdrawals (roadmap 5.1)

## Purpose
Separate withdrawal **requests** from **executed** money movement. A request is a row in a new `withdrawals` table (`pending`); an approver (the platform admin — logs in as a regular user; admin auth + UI deferred) flips it to `approved` or `declined`. Only an approval creates the ledger `withdrawal` transaction (−amount, `status: processed`), so balances drop **at approval time**. Users never process their own withdrawals — the user-facing "Process" button is removed. Balance is re-checked at approval and the request is declined if it is no longer covered.

This item also turns **/me into an editable profile** (name, email, phone, bank + account number) — the destination account is captured there once and snapshotted onto each withdrawal request.

## User Flow
1. User opens **Me** → sees editable profile: name, email, phone, and account details (bank from the seeded list + account number); saves changes
2. User opens **Withdraw** → sees available balance, enters an amount, live "balance after withdrawal" preview, and the saved destination account (read-only; link to Me to change it)
3. Withdraw button → creates a **pending request** (snapshotting the destination account) — no money moves yet, no Process button anywhere
4. Approver (dev tooling / later admin UI) lists pending requests and decides:
   - **Approve** → balance re-checked; if covered, a ledger `withdrawal` row is created (balance drops) and the request flips to `approved`
   - **Decline** (including auto-decline when the balance no longer covers the request) → request flips to `declined` with an optional reason
5. User sees their requests on the Withdraw page with status badges (Pending / Approved / Declined + reason when present)

## Rules
- `withdrawals` statuses: `pending | approved | declined`; only `pending` may transition; `decided_at`/`decided_by` are set on transition
- Request gate (at request time): amount > 0 and ≤ available balance (`user_balances`)
- Approval gate (at approval time): balance re-checked against the current `user_balances`; if < amount the request is **declined** (reason "Insufficient balance") — never approved
- Approve = insert ledger row (`user_id`, `type: 'withdrawal'`, −amount rounded 2dp, `status: 'processed'`) then mark the request `approved`; if the insert fails the request stays `pending` (retry-safe)
- Decline = mark `declined`, optional `reason` text, no ledger row
- Legacy rows: existing `transactions` rows `type='withdrawal' & status='pending'` become `withdrawals` rows (`pending`) and their ledger rows are deleted (they never affected balances); `processed` ledger rows remain as history
- Destination account: captured on the user profile (`users.bank`, `users.account_number`) and **snapshotted** onto the `withdrawals` row (bank, account number, account name) at request time — requests are self-contained for the approver
- A user without saved bank details gets a clear "add bank details on your profile first" error when requesting
- Profile editing rules: name required; email/phone validated as at signup and unique (409 on conflict); bank must be a seeded `banks` id (nullable); account number digits only
- No admin UI, no admin auth gating in this item — the decision endpoint exists and is dev-usable; admin gating lands with platform tooling

## Acceptance Criteria
- [ ] Migration 0009 applies cleanly: `withdrawals` table + legacy pending-row migration; 0001–0008 untouched
- [ ] `POST /api/withdrawals` creates a `pending` request (amount > 0, ≤ balance, destination snapshot present); rejects missing account details / invalid amount / over-balance
- [ ] `GET /api/withdrawals` returns the signed-in user's requests (pending/approved/declined), newest first
- [ ] Decision endpoint: approve (balance covered) → ledger row created (`withdrawal`, −amount, processed) + request `approved`; approve with insufficient balance → request `declined` ("Insufficient balance"), no ledger row; decline → `declined` (+ optional reason); double-decision on an already-decided request is a no-op/error
- [ ] Legacy pending ledger rows appear as `pending` requests; balances unchanged by the migration
- [ ] Me page = editable profile only (name, email, phone, bank, account number) with save + error states; no referral-code card, no withdraw/referrals buttons, no sign-out (those live on the dashboard)
- [ ] `/referrals` stays reachable (dashboard referral cards link to it)
- [ ] Withdraw page: no Process control; list shows status badges + declined reason; destination shown read-only
- [ ] Signup/login untouched; typecheck + lint clean; E2E: request → approve → balance drops; request → decline; insufficient-at-approval auto-decline
