# Feature: Admin Platform UI (roadmap 5.2)

## Purpose
Give the platform admin (the `role = 'admin'` user from 5.1, signing in through the normal login) a dedicated mobile-first area at `/admin` with its own bottom bar — **Dashboard** and **Withdrawals**. The dashboard shows platform-wide metrics; the withdrawals page is the review queue where pending requests are approved or declined by calling the admin-gated decision endpoint built in 5.1. Non-admin users are redirected away from `/admin`; the platform admin keeps full access to the regular user app.

## User Flow
1. Admin signs in normally → sees the regular dashboard; the settings menu shows an extra **Admin panel** item (role-based)
2. Admin taps it → `/admin` (own shell, bottom bar: Dashboard / Withdrawals)
3. **Dashboard**: metric tiles — total users, total nodes, platform balance, lifetime platform revenue, pending withdrawals, total payout requested, open jobs
4. **Withdrawals**: queue of requests (pending first by default, filterable by status) showing requester, amount, destination bank/account, requested date
5. Tap **Accept** → approves (ledger row created, balance drops); tap **Decline** → optional reason prompt → declined (no money moves)
6. The queue refreshes after each decision; a declined-with-reason badge/state is visible in the history

## Rules
- Admin identity is `users.role = 'admin'` (only the platform account today); all `/api/admin/*` endpoints and `/admin/*` pages enforce it — 403 / redirect otherwise
- `GET /api/admin/stats` metrics:
  - total users = `role = 'user'` count (platform account excluded)
  - total nodes = all `nodes` rows
  - platform balance = `user_balances` for `PLATFORM_USER_ID`
  - lifetime platform revenue = Σ `transactions.amount` where `user_id = PLATFORM_USER_ID` and type in (`node_sale`, `platform_earnings`)
  - pending withdrawals = count of `withdrawals` where status `pending`
  - total payout requested = Σ `withdrawals.amount` where status `pending`
  - open jobs = `jobs` where `status = 'open'`
- `GET /api/admin/withdrawals` returns requests with requester (name/email) + destination snapshot; `?status=` filter (default: pending first ordering)
- Decisions reuse `POST /api/withdrawals/[id]/decision` from 5.1 (admin-only, pending-only, approval-time balance re-check)
- Accept button is green; Decline is red (both secondary-styled); declining opens an optional-reason step before confirming
- UI never reveals a user's full account number outside the admin page (masked in user-facing views; admin sees full for transfer purposes)
- Client guard: `/admin/*` pages check the session role and redirect non-admins to `/`; the API endpoints are the real gate

## Acceptance Criteria
- [ ] Admin stats endpoint returns all seven metrics correctly (user count excludes platform; revenue sums only `node_sale` + `platform_earnings`)
- [ ] Admin withdrawals endpoint: all requests + requester/destination, `?status=` filter works, default pending first; non-admin → 403
- [ ] Admin shell renders at `/admin` with bottom bar (Dashboard / Withdrawals); non-admin visiting `/admin` is redirected to `/`
- [ ] Dashboard tiles show the metrics with loading/error states
- [ ] Withdrawals page lists requests; Accept approves (ledger row + balance drop, request flips); Decline prompts for an optional reason then flips to declined; list refreshes
- [ ] Settings menu shows "Admin panel" only for `role = 'admin'` users
- [ ] Typecheck + lint clean; E2E: admin approves/declines from the UI; non-admin blocked at both page and API level
