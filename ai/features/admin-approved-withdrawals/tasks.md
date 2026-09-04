# Tasks

## Migration
- [x] Migration `0009_withdrawals.sql`: `withdrawals` table (user, amount > 0, status pending|approved|declined, destination snapshot bank/account_number/account_name, reason, created_at, decided_at, decided_by)
- [x] Migration 0009: legacy move — `transactions` rows `type='withdrawal' & status='pending'` → `withdrawals` (pending), delete their ledger rows; processed rows untouched
- [x] Migration 0009: `users.role` (`user` | `admin`); platform row → `admin`
- [x] Platform login: one-off dev script (`scripts/set-platform-password.ts`, run via `node --env-file=.env`) — imports `lib/auth/password` to hash a chosen password and PATCHes the platform user row; verify sign-in at `platform@x034.local` works
- [x] Apply 0009 to the hosted DB (fresh install runs clean; 0001–0008 untouched)

## Profile (Me page)
- [x] `app/api/banks/route.ts`: GET seeded banks
- [x] `app/api/me/route.ts`: GET profile (bank joined) + PATCH (name/email/phone/bank/account_number; signup-style validation; 409 on unique conflicts)
- [x] Rebuild `components/me/me-client.tsx`: editable profile form (name, email, phone, bank dropdown, account number) with load/save/error states; remove referral-code card + withdraw/referrals buttons + sign-out
- [x] Dashboard settings menu gains a "Profile" item → `/me` (the page's entry point; withdraw stays on the balance card)
- [x] Dashboard referral cards link to `/referrals` (keeps it reachable; sign-out stays in settings)
- [x] Typecheck + lint clean

## Withdrawal endpoints
- [x] `POST /api/withdrawals`: create pending request — amount > 0 and ≤ balance; snapshot destination from the user profile; clear error when account details missing
- [x] `GET /api/withdrawals`: signed-in user's requests (bank joined, reason included), newest first
- [x] `POST /api/withdrawals/[id]/decision`: `{ action, reason? }` — **admin-only** (role check → 403); pending-only; approve = balance re-check (decline "Insufficient balance" if short) → insert processed ledger `withdrawal` row → mark approved + decided_at/by; decline = mark declined + optional reason; ledger-insert failure leaves it pending
- [x] Typecheck + lint clean

## Withdraw page
- [x] Remove the Process button/handler from `components/withdraw/withdraw-client.tsx`
- [x] List requests from `GET /api/withdrawals` with status badges (Pending/Approved/Declined) and decline reason
- [x] Show saved destination (bank + masked account) with change link → `/me`
- [x] Typecheck + lint clean

## Verification
- [x] Request → approve: ledger row created (−amount, processed), balance drops, request `approved`
- [x] Request → approve with insufficient balance: auto-declined ("Insufficient balance"), no ledger row
- [x] Request → decline (+ reason): `declined`, no ledger row; reason visible on the withdraw page
- [x] Double-decision on a decided request: rejected (409)
- [x] Non-admin calling the decision endpoint: 403
- [x] Request without saved account details: clear error
- [x] Profile: edit + save all fields; duplicate email/phone → 409; validations enforced
- [x] Legacy pending rows appear as pending requests; balances unchanged (none existed — migration ran clean)
- [x] Typecheck + lint clean
