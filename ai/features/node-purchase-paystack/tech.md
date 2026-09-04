# Technical Plan

## Components
- `supabase/migrations/0007_payments.sql` (new):
  - `payments` table: `id` uuid pk default gen_random_uuid(), `user_id` uuid not null → `users(id)`, `tier` uuid not null → `node_tiers(id)`, `reference` text not null unique, `amount` numeric not null (NGN), `currency` text not null default `'NGN'`, `status` text not null default `'initialized'` check (`initialized`, `success`), `created_at`
  - rebuild `transactions_type_valid` → `('purchase','referral','platform_earnings','node_sale','earnings','withdrawal','funding')` (additive)
  - recreate `user_balances`: existing branches unchanged + `funding` counts immediately
- `lib/constants.ts` — `USD_TO_NGN = 1400`, `PAYSTACK_API = "https://api.paystack.co"`
- `lib/paystack.ts` (new) — server-only helpers over plain fetch:
  - `paystackInitialize({ email, amountKobo, metadata, callbackUrl })` → `POST /transaction/initialize` (Bearer `PAYSTACK_SECRET_KEY`) → `{ reference, authorization_url }` or typed error
  - `paystackVerify(reference)` → `GET /transaction/verify/:reference` → raw `data` (status/amount/metadata)
  - both fail fast with the Paystack message; no retry on POSTs
- `lib/nodes.ts` (new) — extract the purchase body out of `app/api/nodes/purchase/route.ts`:
  - `purchaseNode(userId, tierId)`: tier + buyer lookups → balance gate (`user_balances` ≥ price) → create node → write the four (or three) split rows, each carrying `node` → rollback (DELETE node + written txs) on partial failure → returns `{ node, tier_code, price, splits }`
- `app/api/nodes/purchase/route.ts` — `GET` unchanged (tier list). `POST` becomes an **initializer**:
  - auth → validate `tierId` → fetch tier (`price`) + buyer (`email`) → buyer must have an email (legacy phone-only → `400` with clear message)
  - `amountKobo = Math.round(price × USD_TO_NGN × 100)`; metadata `{ user_id: session.sub, tier_id: tierId }`; `callback_url = ${origin}/nodes/purchase/complete`
  - `paystackInitialize(...)` → insert `payments` row (`initialized`, returned reference, amount NGN = amountKobo/100) → `200 { authorization_url, reference }`
  - on any Paystack/DB failure nothing is delivered; the client stays on the purchase page with the error
- `app/api/nodes/purchase/complete/route.ts` (new) — `POST { reference }` (auth):
  1. `paystackVerify(reference)`
  2. guards: `data.status === "success"`; expected amount from the `payments` row (kobo × 100 = row.amount); `data.metadata.user_id === session.sub`; `data.metadata.tier_id === payments.tier`
  3. idempotent claim: `UPDATE payments SET status = 'success' WHERE reference = … AND status = 'initialized'`; if 0 rows and the row is already `success` → return the already-created result (no-op); if 0 rows and absent → 404
  4. write buyer `funding` +P (`type: 'funding'`, amount = NGN/1400 rounded 2dp)
  5. `purchaseNode(session.sub, payments.tier)` (gate passes off the fresh funding) → `200 { node, splits, payment: { reference, amount } }`
- `app/nodes/purchase/complete/page.tsx` + `components/nodes/purchase-complete-client.tsx` (new) — reads `?reference=`, `POST`s the complete API; renders verifying spinner → success (node tier + link to `/nodes`) or error (message + retry link to `/nodes/purchase`)
- `components/nodes/purchase-client.tsx` — `buy(tierId)` now POSTs the initializer and `window.location.assign(authorization_url)`; busy label "Contacting Paystack…"; on init error show it inline; GET-tier list unchanged
- `app/api/auth/signup/route.ts` + `components/auth/signup-form.tsx` — require **email AND phone** (existing per-field validation, no longer "at least one")
- No changes: withdraw page (it renders only withdrawals now, so no `funding` label site), dashboard, marketplace routes

## API
- `GET /api/nodes/purchase` — tier list (unchanged)
- `POST /api/nodes/purchase` — `{ tierId }` (auth) → `200 { authorization_url, reference }` | `400` (invalid tier / no email / Paystack failure)
- `POST /api/nodes/purchase/complete` — `{ reference }` (auth) → `200 { node, tier_code, price, splits, payment }` | `400` (verification failed / mismatched) | `409`/no-op duplicate → same success body
- `POST /api/withdrawals`, `GET /api/transactions` — unchanged (funding rows flow through the balance view automatically)

## Data Model
```
payments { id, user_id → users, tier → node_tiers, reference unique, amount (NGN), currency = 'NGN', status: initialized | success, created_at }
transactions type check: + funding
user_balances: + funding immediate
```

## Flow
tier tap → `POST /api/nodes/purchase` (init) → insert `payments(initialized)` → Paystack `authorization_url` → browser redirect → Paystack hosted checkout (NGN) → callback `?reference=` → `POST /api/nodes/purchase/complete` → verify → status/amount/metadata guards → claim `payments` row → `funding` +P → `purchaseNode` (gate → node → splits, rollback-safe) → success UI → `/nodes`

## Notes
- Env: server reads `PAYSTACK_SECRET_KEY` (already in `.env`, gitignored). `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` unused for now (redirect flow) but kept for a possible popup upgrade.
- Amount check uses kobo as returned by Paystack (`data.amount`), compared against `payments.amount × 100`.
- Callback origin comes from the request (`Origin`/`Host` headers fallback) so dev + Vercel both work without a new env var.
- Funding amount = `payments.amount / USD_TO_NGN` rounded to 2dp; purchase splits are computed from the USD price as today, so funding exactly covers them (rounding differences are impossible at 1400 × whole-dollar prices: price × 1400 × 100 is always an integer number of kobo, and funding = price exactly).
- The balance gate inside `purchaseNode` is kept as an invariant (fresh funding guarantees ≥ price); no other caller changes.
- Test mode: any amount works with Paystack's published test cards; no real money moves.
