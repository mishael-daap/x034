# Tasks

## Admin endpoints
- [x] `app/api/admin/stats/route.ts`: admin-gated (role check → 403); counts (users role=user, nodes, open jobs), platform balance, platform revenue (node_sale + platform_earnings), pending withdrawal count + payout total
- [x] `app/api/admin/withdrawals/route.ts`: admin-gated; list with requester (name/email) + destination + bank name; `?status=` filter
- [x] Typecheck + lint clean

## Admin shell + guards
- [x] `components/admin/admin-guard.tsx`: `/api/auth/me` → loading / redirect to `/login` (no session) / redirect to `/` (not admin) / children
- [x] `components/app-shell/admin-shell.tsx`: bottom bar with Dashboard + Withdrawals tabs (active state)
- [x] `app/admin/layout.tsx`: guard + shell wrapper
- [x] Dashboard settings: "Admin panel" item shown only when `user.role === 'admin'`
- [x] Typecheck + lint clean

## Admin pages
- [x] `components/admin/admin-dashboard-client.tsx` + `app/admin/page.tsx`: stats tiles (platform balance hero + metric grid), loading/error states
- [x] `components/admin/admin-withdrawals-client.tsx` + `app/admin/withdrawals/page.tsx`: queue list (requester, amount, destination, date, status), status filter chips, Accept (green) / Decline (red) on pending rows, decline dialog with optional reason, refresh after decision
- [x] Typecheck + lint clean + build passes

## Verification
- [x] Stats endpoint numbers correct (user count excludes platform; revenue = node_sale + platform_earnings only; pending payout total sums pending requests)
- [x] Admin withdrawals endpoint: `?status=` filter works; non-admin → 403
- [ ] Non-admin visiting `/admin` redirected to `/`; unauthenticated → `/login` (code-level; needs browser check)
- [x] Accept from the API approves (ledger row + balance drop); Decline w/ reason declines; list refreshes
- [ ] "Admin panel" visible only to the admin user (code-level; needs browser check)
- [x] Typecheck + lint clean
