# Feature: Referrals & Withdrawals (+ App Shell & Dashboard)

## Purpose
Deliver roadmap item 4: referral tracking with referral-gated job unlocks, and a 2-step withdrawal flow using test currency. Plus the post-auth app shell: a dashboard (account balance + deposit + feature entries) with a fixed bottom tab bar (Home / Nodes / Me).

## User Flow
1. User signs in → lands on the **dashboard** (home): account balance, Deposit button, and three feature entries (Financial products, Management positions, Company activity)
2. Bottom tabs (fixed): **Home** (dashboard), **Nodes** (my nodes), **Me** (profile + links)
3. Deposit: tap Deposit → enter amount → test funds added to balance (immediate)
4. Withdraw: from Me/withdraw page → enter amount ≤ available balance → creates **pending** withdrawal
5. Process: tap "Process" on a pending withdrawal → becomes **processed** (funds leave balance; sandbox simulates the bank)
6. Referrals: Me → My referrals → see code, referees, qualifying count (referee owns ≥1 node)
7. Company activity: dashboard entry → list of companies + their open jobs

## Rules
- Qualifying referral = referee (via `referrer`) owns ≥ 1 node
- Withdrawal is 2-step: `pending` → `processed`; only pending can be processed; processed is final
- Withdrawable balance excludes pending withdrawals (they are in-flight), includes processed withdrawals, purchases, deposits, and elapsed earnings
- `withdrawal` amounts are stored negative; `deposit` positive; earnings positive; purchase negative
- Deposit: any positive amount, immediate credit (test currency, no cap)
- Job-unlock referral gating: **display-only** in this item (enforcement deferred, marketplace commit route untouched)

## Acceptance Criteria
- [ ] Signed-in home is the dashboard: balance + Deposit + 3 feature entries
- [ ] Bottom tab bar fixed on Home/Nodes/Me with active state
- [ ] Deposit adds a `'deposit'` transaction and updates balance immediately
- [ ] `POST /api/withdrawals` creates a `pending` withdrawal when amount ≤ available balance; rejects otherwise
- [ ] `POST /api/withdrawals/[id]/process` flips `pending` → `processed` once
- [ ] Balance view excludes pending withdrawals
- [ ] `GET /api/transactions` returns balance + full ledger (newest first)
- [ ] `GET /api/referrals/me` returns code, referees, qualifying count
- [ ] `/companies` lists seeded companies with open job counts
- [ ] E2E: deposit → withdraw → process → balance reflects all steps
