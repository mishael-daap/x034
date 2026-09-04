# Technical Plan

## Components
- `supabase/migrations/0006_revenue_model.sql`:
  - drop + recreate `transactions_type_valid` → `('purchase','referral','platform_earnings','node_sale','earnings','withdrawal')` (removes `deposit`)
  - seed the platform user (idempotent `on conflict (id) do nothing`): fixed id `00000000-0000-4000-8000-000000000001`, name `Platform`, reserved email `platform@x034.local`, unusable `password_hash` placeholder (never logged in), fixed unique `referral_code`, `referrer` null
  - recreate `user_balances`: `earnings` after job elapse; `withdrawal` only when `processed`; `purchase`/`referral`/`platform_earnings`/`node_sale` immediate; no `deposit` branch
  - add nullable `transactions.node` (FK → `nodes(id)`) — purchase-family attribution
- `lib/constants.ts` — `PLATFORM_USER_ID` (same uuid), `NODE_SALE_SHARE = 0.5`, `PLATFORM_CUT_SHARE = 0.2`, `REFERRAL_COMMISSION_SHARE = 0.3`
- `app/api/nodes/purchase/route.ts` — balance gate + multi-row split write
- `app/api/auth/signup/route.ts` — exclude the platform row from referrer-code resolution
- `app/api/referrals/me/route.ts` — add commission earnings total + recent `referral` transactions
- `components/referrals/referrals-client.tsx` — commissions section
- `components/dashboard/dashboard-client.tsx` — remove deposit dialog/button/handler/state
- `components/withdraw/withdraw-client.tsx` — `typeLabel`: drop `deposit`, add `referral`/`platform_earnings`/`node_sale`
- delete `app/api/deposits/route.ts`

## API
- `POST /api/nodes/purchase` — `{ tierId }` (auth):
  1. fetch tier (`price`) and buyer (`referrer`)
  2. balance gate: `user_balances` for buyer ≥ price, else `400 Insufficient balance`
  3. create node (`owner`, `tier`)
  4. write rows (amounts rounded to 2dp, each carrying `node` = the new node's id): buyer `purchase` −P; platform `node_sale` +0.5P; platform `platform_earnings` +0.2P (or +0.5P if no referrer); referrer `referral` +0.3P (if referrer)
  5. on any write failure: roll back created node + transactions (DELETE) so a retry is safe
  - response `201 { node, tier_code, price, splits: { referral, platform_earnings, node_sale } }`
- `GET /api/referrals/me` — adds `commission_earnings` (sum of `referral` txs) + `commissions` (recent `referral` rows, embedding referee name + tier via `node` → `owner` + `node_tiers`)
- `GET /api/transactions`, `POST /api/withdrawals`, `POST /api/withdrawals/[id]/process` — unchanged (platform reuses them via its user row)

## Data Model
```
users: + seeded platform row (fixed id, reserved email, unusable hash, own referral_code)
transactions: + node uuid null references nodes(id) — the node whose sale caused the row (purchase family); earnings keep reference_id → assignments
transactions type check: purchase | referral | platform_earnings | node_sale | earnings | withdrawal   (deposit removed)
user_balances (view): sum(
  earnings when j.starts_at + j.actual_duration_hours*'1 hour' <= now()
  withdrawal when status = 'processed'
  purchase | referral | platform_earnings | node_sale  (immediate)
) group by user_id
```

## Flow
Purchase → auth → tier + buyer lookup → balance gate → create node → write buyer debit + platform credits (+ referrer credit) → rollback on failure → balances update immediately (view)

## Notes
- Split math: prices are $10/$50/$100 so 0.2/0.3/0.5 splits are clean; still round to 2dp.
- Sandbox funding: with deposits gone and payment processing pending, a fresh user has $0 — E2E of a *successful* purchase funds the test account via a direct ledger credit (any type) until payments exist; the *rejection* path is testable at $0.
- Platform login/UI is out of scope here; verify its balance/history with direct queries.
- Commission attribution: `referral` rows carry `node` → join `nodes(owner)` for the referee and `node_tiers` for the tier; no need for a second reference column.
