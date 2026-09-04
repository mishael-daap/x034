# Tasks

## Admin endpoints
- [ ] `app/api/admin/stats/route.ts`: admin-gated (role check → 403); counts (users role=user, nodes, open jobs), platform balance, platform revenue (node_sale + platform_earnings), pending withdrawal count + payout total
- [ ] `app/api/admin/withdrawals/route.ts`: admin-gated; list with requester (name/email) + destination + bank name; `?status=` filter
- [ ] Typecheck + lint clean

## Admin shell + guards
- [ ] `components/admin/admin-guard.tsx`: `/api/auth/me` → loading / redirect to `/login` (no session) / redirect to `/` (not admin) / children
- [ ] `components/app-shell/admin-shell.tsx`: bottom bar with Dashboard + Withdrawals tabs (active state)
- [ ] `app/admin/layout.tsx`: guard + shell wrapper
- [ ] Dashboard settings: "Admin panel" item shown only when `user.role === 'admin'`
- [ ] Typecheck + lint clean

## Admin pages
- [ ] `components/admin/admin-dashboard-client.tsx` + `app/admin/page.tsx`: stats tiles (platform balance hero + metric grid), loading/error states
- [ ] `components/admin/admin-withdrawals-client.tsx` + `app/admin/withdrawals/page.tsx`: queue list (requester, amount, destination, date, status), status filter chips, Accept (green) / Decline (red) on pending rows, decline dialog with optional reason, refresh after decision
- [ ] Typecheck + lint clean + build passes

## Verification
- [ ] Stats endpoint numbers correct (user count excludes platform; revenue = node_sale + platform_earnings only; pending payout total sums pending requests)
- [ ] Admin withdrawals endpoint: `?status=` filter works; non-admin → 403
- [ ] Non-admin visiting `/admin` redirected to `/`; unauthenticated → `/login`
- [ ] Accept from the UI approves (ledger row + balance drop); Decline w/ reason declines; list refreshes
- [ ] "Admin panel" visible only to the admin user
- [ ] Typecheck + lint clean
