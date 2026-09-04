# Feature: Revenue & Commission Model (roadmap 4.1)

## Purpose
Make the platform and referrers earn on every node purchase and record it on a reconciling ledger. Each purchase (price P) is split: 30% referral commission, 20% platform earnings, 50% node-sale proceeds — all fully allocated. The platform is a real actor (a seeded `users` row) with a balance, history, and withdrawals. Deposits (free-funds faucet) are removed.

## User Flow
1. A user with a funded balance purchases a node (price P)
2. Ledger rows are written immediately: buyer `purchase` −P; referrer `referral` +0.3P (only if the buyer has a referrer); platform `node_sale` +0.5P; platform `platform_earnings` +0.2P (or +0.5P when the buyer has no referrer)
3. Buyer's balance drops by P; referrer's and platform's balances rise immediately
4. Referrer sees commission history on the referrals page
5. Platform views its balance/history via the ledger (dev tooling now; dedicated UI later)
6. Any actor (incl. the platform) can withdraw up to available balance, as today

## Rules
- Transaction types: `purchase`, `referral`, `platform_earnings`, `node_sale`, `earnings`, `withdrawal`. `deposit` is removed (no deposit type, no deposit route, no deposit UI).
- Per purchase (price P), rows must reconcile to zero:
  - buyer `purchase` −P
  - referrer `referral` +0.3P — only when the buyer has a referrer
  - platform `node_sale` +0.5P — always
  - platform `platform_earnings` +0.2P — always; +0.5P when the buyer has no referrer (the 30% share stays with the platform)
- `node_sale` and `platform_earnings` are both **credits** to the platform; separate types exist only so each can be reported independently (node-sale revenue vs commission earnings). Nothing leaves the platform's balance beyond what it pays out (referral commission to referrers).
- The platform is a seeded `users` row (`PLATFORM_USER_ID` in `lib/constants.ts`): it earns, holds a balance (`user_balances`), appears in the ledger, and withdraws via the existing 2-step flow.
- Every purchase-family row is attributable: `transactions.node` (nullable FK → `nodes`) points at the purchased node on the buyer's `purchase`, the referrer's `referral`, and the platform's `node_sale`/`platform_earnings` rows — so each entry answers "which node, whose, what tier". Job `earnings` keep `reference_id` → assignment (unchanged).
- Purchases require a balance ≥ price — no negative balances. There is no free-funds faucet; funding comes from payment processing (upcoming feature).
- The platform row is not resolvable as a referrer at signup (its referral code must not award the platform commissions on signups that use it).
- All new credit types count in `user_balances` immediately; `earnings` still counts only after the job elapses; `withdrawal` only when processed (unchanged).

## Acceptance Criteria
- [ ] Migration 0006: type check = `purchase`, `referral`, `platform_earnings`, `node_sale`, `earnings`, `withdrawal` (`deposit` dropped); platform user seeded idempotently; `user_balances` recreated (no deposit term, new credits immediate)
- [ ] A $10 purchase with a referrer books −10 / +3 / +2 / +5 (sums to 0); without a referrer books −10 / +5 / +5 (sums to 0)
- [ ] Purchase is rejected when available balance < price; accepted when balance ≥ price
- [ ] `/api/deposits`, the dashboard deposit dialog/button, and any `deposit` reference are gone
- [ ] Referrer sees commission total + history on the referrals page
- [ ] Platform balance = Σ its rows (earnings + node sales − withdrawals) and is queryable
- [ ] Each purchase's rows share the same `node` (the purchased node); commissions display referee name + tier via the `node` join
- [ ] Signup ignores the platform's referral code as a referrer
- [ ] Typecheck + lint clean; E2E: purchase splits (referred + unreferred), balance gate, no deposit UI
