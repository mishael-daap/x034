# Tasks

## Migration & constants
- [x] Migration `0007_payments.sql`: `payments` table (user, tier, unique `reference`, NGN amount, currency, `status` initialized|success)
- [x] Migration 0007: rebuild `transactions_type_valid` → add `funding` (0001–0006 untouched)
- [x] Migration 0007: recreate `user_balances` — `funding` counts immediately
- [x] Apply 0007 to the hosted DB (fresh install runs 0001 → 0007 clean)
- [x] `lib/constants.ts`: `USD_TO_NGN = 1400`, `PAYSTACK_API` base URL

## Paystack client
- [x] `lib/paystack.ts`: `paystackInitialize` (Bearer `PAYSTACK_SECRET_KEY`, POST initialize) → reference + authorization_url
- [x] `lib/paystack.ts`: `paystackVerify(reference)` → status/amount/metadata
- [x] Typecheck + lint clean

## Purchase route → initializer
- [x] `lib/nodes.ts`: extract `purchaseNode(userId, tierId)` (gate + node + split rows + rollback) from the purchase route; route POST calls it — behavior unchanged
- [x] Rework `POST /api/nodes/purchase` to initialize: fetch tier + buyer email; reject phone-only accounts with a clear message; compute kobo (price × 1400 × 100); metadata `{ user_id, tier_id }`; callback_url from origin; insert `payments(initialized)`; return `authorization_url`
- [x] `GET /api/nodes/purchase` tier list unchanged
- [x] Typecheck + lint clean

## Verify & deliver (complete route)
- [x] `POST /api/nodes/purchase/complete`: verify reference server-side
- [x] Guards: `status === "success"`, amount == payments.amount × 100, `metadata.user_id` == session, tier matches payments row
- [x] Idempotent claim: flip `payments` initialized → success; already-success + delivered → no-op returning existing result
- [x] Write `funding` +P credit; call `purchaseNode`; mark `payments.node`; rollback funding on delivery failure
- [x] Typecheck + lint clean

## UI
- [x] `components/nodes/purchase-client.tsx`: buy → init → redirect to `authorization_url`; "Contacting Paystack…" busy state; inline init errors
- [x] `/nodes/purchase/complete` page + client: read `?reference=`, POST complete API; verifying → success (node + link to `/nodes`) / error + retry
- [x] Signup: require email AND phone (route + form); login untouched
- [x] Typecheck + lint clean

## Verification (E2E, test mode)
- [ ] Happy path: test-card purchase → funding +P, node created, splits −P / +0.5P / +0.2P (+0.3P when referred), shared `node` id
- [ ] Duplicate callback on the same reference → no double funding / second node
- [ ] Failed/cancelled or amount-mismatched verification → no value delivered, clear error UI
- [ ] Legacy phone-only account → clear error at init
- [ ] Signup rejects missing email or phone
- [ ] Balances include `funding` immediately (dashboard + withdraw page math)
