# Technical Plan

## Components
- `supabase/migrations/0004_deposit_balance.sql` — add `'deposit'` transaction type; recreate `user_balances` so pending withdrawals don't count
- `lib/referrals.ts` — qualifying referral queries
- `app/api/deposits/route.ts` — POST deposit (test funds)
- `app/api/withdrawals/route.ts` — POST create pending withdrawal
- `app/api/withdrawals/[id]/process/route.ts` — POST process pending withdrawal
- `app/api/transactions/route.ts` — GET balance + ledger (newest first)
- `app/api/referrals/me/route.ts` — GET referral info (code, referees, qualifying count)
- `app/api/companies/route.ts` — GET companies + open job counts (public)
- `components/app-shell/shell.tsx` + `bottom-tabs.tsx` — bottom tab bar (Home/Nodes/Me) on `/`, `/nodes`, `/me`
- `components/dashboard/dashboard-client.tsx` — balance, deposit, 3 feature entries
- `app/me/page.tsx`, `app/referrals/page.tsx`, `app/withdraw/page.tsx`, `app/companies/page.tsx` (+ client components)

## API
- `POST /api/deposits` — `{ amount }` → `201 { transaction }` (auth; amount > 0)
- `POST /api/withdrawals` — `{ amount }` → `201 { withdrawal }` (auth; amount > 0, ≤ available balance)
- `POST /api/withdrawals/[id]/process` → `200 { withdrawal }` | 409 if not pending (auth, own tx)
- `GET /api/transactions` → `{ balance, transactions[] }` (auth)
- `GET /api/referrals/me` → `{ referral_code, total_referees, qualifying_count, referees[] }` (auth)
- `GET /api/companies` → `{ companies[] }` (public)

## Data Model
- transactions: adds `type = 'deposit'` (positive); withdrawals use `status` (`pending`/`processed`), signed negative
- user_balances (recreated in 0004): earnings count after elapsed; `deposit`/`purchase` immediate; `withdrawal` only when `processed`

## Flow
Dashboard load → `GET /api/transactions` (balance + history). Deposit → POST → refresh balance. Withdraw → POST (validates vs balance incl. pending exclusion) → pending row → Process → PATCH status → balance drops.

## Notes
- Reuses existing `user_balances` + `transactions`; no new tables
- Referral gating enforcement and roadmap status update are deferred (marketplace merge unresolved)
- No marketplace files touched; new files only + own committed files (`home-client.tsx`, `app/layout.tsx`)
