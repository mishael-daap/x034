# Technical Plan

## Components
- `app/api/admin/stats/route.ts` (new, admin-gated via `getUserRole`):
  - parallel counts via PostgREST: `users?select=id&role=eq.user` (count), `nodes?select=id` (count), `jobs?select=id&status=eq.open` (count)
  - platform balance: `user_balances?select=balance&user_id=eq.PLATFORM_USER_ID`
  - platform revenue: `transactions?select=amount&user_id=eq.PLATFORM_USER_ID&type=in.(node_sale,platform_earnings)` → sum (fetch `amount` rows; no aggregate via view needed)
  - pending: `withdrawals?select=amount&status=eq.pending` → count + sum
  - response `{ stats: { total_users, total_nodes, platform_balance, platform_revenue, pending_withdrawals, pending_payout_total, open_jobs } }`
- `app/api/admin/withdrawals/route.ts` (new, admin-gated): `GET ?status=` → `withdrawals?select=id,amount,status,reason,account_number,account_name,created_at,decided_at,bank:banks(name),user:users(id,name,email)&order=created_at.desc` (+`&status=eq.X` when given); default ordering puts pending first (client sorts or server orders with `status` secondary — keep simple: fetch all, client tabs filter; API supports `?status=` for server filtering)
- Admin guard helper `lib/auth/role.ts` `getUserRole` (from 5.1) reused on both routes → 403 when not `admin`
- `components/admin/admin-guard.tsx` (new, client): fetches `/api/auth/me`; loading → null; no user → redirect `/login`; `role !== 'admin'` → redirect `/`; else renders children
- `components/app-shell/admin-shell.tsx` (new): fixed bottom bar (2 tabs: Dashboard `/admin`, Withdrawals `/admin/withdrawals`) with active state — mirrors `bottom-tabs.tsx`; icons `LayoutDashboard`, `ListChecks`
- `app/admin/layout.tsx` (new): wraps children in `AdminGuard` + `AdminShell` + max-w-md container
- `app/admin/page.tsx` + `components/admin/admin-dashboard-client.tsx` (new): fetches `/api/admin/stats`; hero = platform balance; metric tiles grid (2-col, equal size like the referrals tiles): Total users, Total nodes, Platform balance, Platform revenue, Pending withdrawals, Payout requested, Open jobs
- `app/admin/withdrawals/page.tsx` + `components/admin/admin-withdrawals-client.tsx` (new): fetches `/api/admin/withdrawals`; filter chips (Pending / Approved / Declined); rows: requester name, amount (mono), destination (bank + account), date, status badge; Pending rows get **Accept** (green secondary) and **Decline** (red secondary) buttons; Decline opens a small dialog (`ui/dialog`) with an optional reason + confirm; after a decision call `POST /api/withdrawals/[id]/decision` then reload the list; errors surface inline
- `components/dashboard/dashboard-client.tsx`: settings menu shows "Admin panel" (`/admin`) only when `user.role === 'admin'` (user prop already carries role via `/api/auth/me`)
- No changes to 5.1 endpoints, migrations, or the regular app shell

## API
- `GET /api/admin/stats` (admin) → `{ stats: {...} }` | 401 | 403
- `GET /api/admin/withdrawals?status=pending|approved|declined` (admin) → `{ withdrawals: [...] }` | 401 | 403
- Decisions: existing `POST /api/withdrawals/[id]/decision` (5.1)

## Data Model
Unchanged (read-only over 5.1 schema). No new migration.

## Flow
Admin signs in → dashboard settings "Admin panel" → `/admin` (guard + shell) → tabs:
Dashboard: `/api/admin/stats` → tiles
Withdrawals: `/api/admin/withdrawals` → queue → Accept/Decline → decision endpoint → refresh
Non-admin: page guard redirects to `/`; API returns 403

## Notes
- The API routes are the security boundary; the client guard is UX only.
- Metrics are computed with a few count/fetch queries, not SQL aggregates — consistent with the existing PostgREST style and cheap at sandbox scale.
- Revenue excludes `referral`, `earnings`, `funding`, `withdrawal`, `purchase` rows — it reports only what the platform earned from sales and its cut (node_sale + platform_earnings).
- Full account numbers are admin-only data; user-facing pages keep masking.
- Decline-with-reason dialog reuses `components/ui/dialog.tsx` (already used by the dashboard settings pattern).
