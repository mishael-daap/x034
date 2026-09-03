# Tasks

## Migration
- [ ] Migration `0006_revenue_model.sql`: rebuild `transactions_type_valid` → `('purchase','referral','platform_earnings','node_sale','earnings','withdrawal')` (drop `deposit`)
- [ ] Migration 0006: seed the platform user (fixed id, reserved email, unusable hash, unique referral code; idempotent)
- [ ] Migration 0006: recreate `user_balances` — `deposit` term removed; `referral`/`platform_earnings`/`node_sale` immediate
- [ ] Migration 0006: add nullable `transactions.node` (FK → `nodes(id)`) for purchase-family attribution
- [ ] Apply 0006 to the hosted DB (migrations 0001–0005 untouched; fresh install runs clean)

## Constants & lib
- [ ] `lib/constants.ts`: `PLATFORM_USER_ID`, `NODE_SALE_SHARE` (0.5), `PLATFORM_CUT_SHARE` (0.2), `REFERRAL_COMMISSION_SHARE` (0.3)

## Purchase route
- [ ] `POST /api/nodes/purchase`: fetch tier + buyer (`referrer`)
- [ ] Balance gate: reject when `user_balances` < price (`400 Insufficient balance`)
- [ ] Split write: buyer `purchase` −P; platform `node_sale` +0.5P; platform `platform_earnings` +0.2P (or +0.5P with no referrer); referrer `referral` +0.3P (only when referred); every row carries `node` = the new node's id
- [ ] Rollback (DELETE node + written txs) on partial write failure; response includes splits
- [ ] Round all amounts to 2dp

## Deposit removal
- [ ] Delete `app/api/deposits/route.ts`
- [ ] `dashboard-client.tsx`: remove deposit dialog, button, handler, state
- [ ] `withdraw-client.tsx`: `typeLabel` — drop `deposit`, add `referral`/`platform_earnings`/`node_sale`
- [ ] Grep app/ + components/ for leftover `deposit` references and remove

## Referrals & platform visibility
- [ ] `signup/route.ts`: exclude the platform row from referrer-code resolution
- [ ] `GET /api/referrals/me`: add `commission_earnings` + recent `referral` transactions with referee name + tier (embed `node` → owner + tier)
- [ ] Referrals page: show total referral earnings + recent commissions with "from <referee>'s <tier> node"

## Verification
- [ ] Typecheck + lint clean
- [ ] E2E: $10 referred purchase → rows −10/+3/+2/+5; unreferred → −10/+5/+5
- [ ] E2E: all four purchase rows share the same `node`; commission shows referee + tier
- [ ] E2E: purchase rejected at $0 balance; accepted after funding (direct ledger credit in sandbox)
- [ ] E2E: platform balance/history correct via direct queries
- [ ] E2E: no deposit button/route anywhere
