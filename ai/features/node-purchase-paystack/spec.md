# Feature: Paystack Node Payments (roadmap 5)

## Purpose
Fund node purchases with real card payments via Paystack (test mode). A user picks a tier and pays on Paystack's hosted checkout; once the payment is verified server-side, the buyer's balance receives a `funding` credit and the **existing, unchanged purchase split** runs — node created, reconciling ledger rows written (buyer debit, platform node-sale/earnings, referrer commission). Prices are shown in USD and charged in NGN at a fixed sandbox rate (1 USD = 1400 NGN). Because Paystack requires a customer email, signup now requires **both email and phone**.

## User Flow
1. User taps **Purchase** on a tier card at `/nodes/purchase`
2. The app shows "Contacting Paystack…"; the server initializes the transaction and the browser redirects to Paystack's hosted page
3. User pays (test card in test mode); the Paystack page shows the NGN equivalent of the USD price
4. Paystack redirects back to `/nodes/purchase/complete?reference=…`
5. The app verifies server-side (spinner while verifying)
6. On success the node is created and the user is taken to their nodes (or a success screen with a link to it)
7. On failure/cancel the user sees an error with a retry link back to the purchase page
8. New signups must supply both email and phone; a legacy phone-only account gets a clear "add an email" error if it tries to buy

## Rules
- Paystack secret key is **server-only** (`PAYSTACK_SECRET_KEY` env). The public key exists but is unused — we use the hosted-redirect flow, not the inline popup.
- Amount unit is the currency subunit: `amount_kobo = round(price_usd × USD_TO_NGN × 100)` with `currency: NGN`.
- Every initialize call carries `metadata: { user_id, tier_id }` and an absolute `callback_url` built from the request origin (works on localhost and Vercel previews).
- Value is delivered **only after server-to-server verification** (`GET /transaction/verify/:reference`). Never trust the callback query string alone.
- Credit value only when ALL hold: `data.status === "success"`, `data.amount` equals the expected kobo amount, `data.metadata.user_id` equals the signed-in user, and the tier on the verify payload matches the `payments` row's tier.
- Idempotency: `payments.reference` is unique. A second callback for an already-`success` reference is a no-op returning the existing result — no double funding, no second node.
- A node is created only after successful verification.
- Ledger on success (exact rows, amounts rounded to 2dp, purchase-family rows carry `node` = the new node's id):
  - buyer `funding` +P (immediate in `user_balances`)
  - buyer `purchase` −P
  - platform `node_sale` +0.5P
  - platform `platform_earnings` +0.2P (or +0.5P when the buyer has no referrer)
  - referrer `referral` +0.3P (only when the buyer has a referrer)
- Card purchases are no longer gated on available balance (the payment itself is the funding). The existing balance gate stays inside the shared purchase helper as an invariant — the just-credited `funding` makes it pass.
- `USD_TO_NGN = 1400` is a fixed constant (test-mode plumbing; a live rate lookup is deferred).
- Signup requires email + phone (email lowercased, phone format-checked as today). Login is unchanged.
- Abandoned/failed payments leave the `payments` row `initialized`; the buyer simply retries, which creates a fresh reference. No cleanup job in this item.
- Webhooks (`charge.success`) are **deferred** — a later hardening step. Verification-on-callback plus the unique-reference guard is the MVP guarantee.
- Phase 1 remains test money: Paystack test mode + test cards.

## Acceptance Criteria
- [ ] Migration 0007 applies cleanly (payments table, `funding` type, `user_balances` counts funding immediately); 0001–0006 untouched; fresh install runs clean
- [ ] `POST /api/nodes/purchase` initializes a Paystack transaction — kobo amount = price × 1400 × 100, `currency: NGN`, metadata, `callback_url` — inserts a `payments` row (`initialized`) and returns `authorization_url` + `reference`; `GET /api/nodes/purchase` still lists tiers
- [ ] Paying with a test card redirects back; verification books: `funding` +P, node for the correct tier/owner, and purchase rows −P / +0.5P / +0.2P (+0.3P when referred) — all four purchase-family rows share the node id
- [ ] Re-verifying the same reference (duplicate callback) neither double-funds nor creates a second node
- [ ] Verify rejects wrong amount / mismatched metadata / abandoned or failed transactions (no value delivered)
- [ ] Legacy phone-only account receives a clear error at initialize
- [ ] Signup rejects a missing email or missing phone
- [ ] `funding` rows count toward balances immediately (withdraw page math and dashboard unaffected otherwise)
- [ ] Typecheck + lint clean; E2E: happy path, duplicate callback, failed verify, phone-only init error
