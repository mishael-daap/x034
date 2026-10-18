# Business Rules

## Node Tiers
- C: 4 vCPU / 16 GB / 1 GPU / 1 Gbps — $10
- B: 8 vCPU / 32 GB / 2 GPU / 2 Gbps — $50
- A: 16 vCPU / 64 GB / 4 GPU / 4 Gbps — $100
- Any tier is purchasable by anyone who pays — referrals never gate tier purchases.
- Owning a node qualifies the owner as a referral for their referrer; a user can own multiple tiers.

## Referrals
- Direct referrals only (no multi-level).
- Qualifying referral = a direct referee owns ≥ 1 node; counts once, gates jobs.
- Referral commission: referrer earns **30% of every node purchase** by a direct referee, credited immediately.
- A purchase with no referrer pays no commission — that 30% stays with the platform.

## Jobs & Offers
- Tiered jobs (A/B/C) posted by simulated companies.
- Job = `total_payout` (pot, ≥ platform floor) + `duration_hours` + `starts_at` + optional referral requirement (n), independent of job tier.

## Matching & Earnings
- Joining a job requires both: node tier ≥ job tier, and qualifying referrals ≥ n.
- Pot split equally: each pool node earns `total_payout ÷ pool size`, regardless of node tier.
- Credited when the job completes (`starts_at` + actual duration elapsed); node returns to available after.

## Node Pool
- Nodes join until the pool hits capacity or 1 h before `starts_at`, whichever first.
- Capacity `n_max = floor(total_payout ÷ platform floor)` (floor = 0.1).
- Pool locks at start — no joins or leaves after.

## Money & Ledger
- Transaction types: `purchase` (buyer debit), `referral` (referrer credit), `platform_earnings` (platform cut), `node_sale` (platform sale proceeds), `earnings` (job credit, available after job elapses), `funding` (card top-up credit), `withdrawal` (debit, available when processed), `withdrawal_refund` (credit when a payout fails or reverses). No `deposit`.
- Every purchase (price P) reconciles to zero: buyer `purchase` −P; platform `node_sale` +0.5P; platform `platform_earnings` +0.2P; referrer `referral` +0.3P (only when the buyer has a referrer).
- `node_sale` and `platform_earnings` are both credits to the platform — separate types only so each can be reported independently (node-sale revenue vs commission earnings); nothing leaves the platform's balance beyond what it pays out.
- No referrer → the referral share stays with the platform: `platform_earnings` = +0.5P.
- The platform is an actor — a seeded `users` row — that earns, holds a balance, and withdraws like any user.
- No negative balances — node purchases must be paid for (payment processing is an upcoming feature).

## Withdrawals
- Paid to the user's bank account through Paystack Transfers. Destinations must be Paystack-verified — the user never types the account name.
- One active request per user (`pending` or `processing`); amount ≤ available balance.
- Admin approval is the only trigger. Users never process their own withdrawals.
- Statuses: `pending` → `processing` → `paid`; `failed` (refunded) and `declined` are terminal.
- Approval debits the full request immediately (funds are held), pays out 90%, and the platform keeps 10%.
- Platform commission is credited only once Paystack confirms the transfer succeeded.
- A failed or reversed transfer refunds the full request exactly once (`withdrawal_refund`).
- The platform bears the Paystack transfer fee; the user receives exactly 90% of the request.
- Payouts are made in NGN at a fixed USD→NGN rate, snapshotted on each payout record.
- Never gated by referrals.

## Phase 1
- Simulated companies, jobs, and node work; test currency; no real payments yet.
