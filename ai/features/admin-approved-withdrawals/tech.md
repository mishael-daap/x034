# Technical Plan

## Components
- `supabase/migrations/0009_withdrawals.sql` (new):
  - `withdrawals` table:
    - `id` uuid pk default gen_random_uuid()
    - `user_id` uuid not null → `users(id)` on delete restrict
    - `amount` numeric not null (positive; requested amount)
    - `status` text not null default `'pending'` check (`pending`, `approved`, `declined`)
    - destination snapshot: `bank` uuid → `banks(id)` (nullable), `account_number` text (nullable), `account_name` text (nullable)
    - `reason` text (nullable — set when declined)
    - `created_at` timestamptz default now(); `decided_at` timestamptz (nullable); `decided_by` uuid → `users(id)` (nullable)
    - indexes: `(user_id)`, `(status)`
  - legacy migration: `INSERT INTO withdrawals (user_id, amount, status, created_at) SELECT user_id, abs(amount), 'pending', created_at FROM transactions WHERE type='withdrawal' AND status='pending'` then `DELETE` those transactions rows (they never affected `user_balances`); `processed` ledger rows untouched
  - admin identity: `users.role` text not null default `'user'` check (`user`, `admin`); `UPDATE users SET role = 'admin' WHERE id = PLATFORM_USER_ID`
  - platform login: replace the platform row's unusable hash with a real scrypt hash (generated app-side with `lib/auth/password` — scrypt isn't expressible in SQL; run as a one-off dev script and document the command)
- `app/api/me/route.ts` (new): `GET` (profile: name, email, phone, bank + account number via join `bank:banks(name)`, referral_code, created_at) and `PATCH` (auth): update name / email / phone / bank / account_number with the same validation rules as signup; unique-conflict → 409 (`users_email_key` / `users_phone_key`)
- `app/api/banks/route.ts` (new): `GET` seeded banks list (`id`, `name`) — for the profile dropdown
- `app/api/withdrawals/route.ts`:
  - `POST` — create request: auth; amount valid (> 0, ≤ `user_balances`); fetch user profile (name, bank, account_number) → reject with a clear message if no bank/account; insert `withdrawals` row `pending` with the destination snapshot
  - `GET` — the signed-in user's requests (join `bank:banks(name)`), newest first: `{ id, amount, status, reason, bank, account_number, created_at, decided_at }`
- `app/api/withdrawals/[id]/decision/route.ts` (new): `POST { action: "approve" | "decline", reason? }` (auth + `role = 'admin'` check → 403 for non-admins):
  1. fetch the request; 404 if absent; 409 if not `pending`
  2. `approve`: fetch owner's `user_balances`; if < amount → decline path with reason "Insufficient balance"; else insert ledger row (`user_id`, `type: 'withdrawal'`, `amount: -round2(amount)`, `status: 'processed'`) — on insert failure return 502 and leave `pending`; then PATCH request → `approved` + `decided_at`/`decided_by`
  3. `decline`: PATCH request → `declined` + `reason` (optional) + `decided_at`/`decided_by`
- `components/me/me-client.tsx` (rebuild): editable profile form — name, email, phone (validated as signup), bank dropdown (from `/api/banks`), account number; loads `GET /api/me`; saves via `PATCH /api/me`; inline + server errors; loading state; no referral-code card / referral / withdraw / sign-out controls
- `components/withdraw/withdraw-client.tsx`: remove the Process button/handler; list from `GET /api/withdrawals`; status badges Pending / Approved / Declined; show `reason` under declined rows; show saved destination (bank name + masked account) with a "Change" link → `/me`; keep balance hero + live remaining preview + request creation
- `components/dashboard/dashboard-client.tsx`: make the referral section cards link to `/referrals` (keeps the page reachable after the Me rebuild); sign-out stays in the dashboard settings menu

## API
- `GET /api/banks` — `{ banks: [{ id, name }] }`
- `GET /api/me` — `{ user: { id, name, email, phone, bank: { id, name } | null, account_number, referral_code } }`
- `PATCH /api/me` — `{ name?, email?, phone?, bank?, account_number? }` → `200 { user }` | `400` validation | `409` email/phone taken
- `POST /api/withdrawals` — `{ amount }` → `201 { withdrawal }` | `400` invalid amount / over balance / missing account details
- `GET /api/withdrawals` — `{ withdrawals: [...] }`
- `POST /api/withdrawals/[id]/decision` — `{ action: "approve" | "decline", reason? }` → `200 { withdrawal }` | `404` / `409` (not pending) / `502` (ledger insert failed, still pending)
- `GET /api/transactions`, `POST /api/auth/*` — unchanged

## Data Model
```
withdrawals { id, user_id → users, amount (>0), status: pending|approved|declined,
              bank → banks?, account_number?, account_name?, reason?, created_at,
              decided_at?, decided_by? → users }
users.bank / users.account_number — now actually written via PATCH /api/me
ledger: type 'withdrawal' rows are created only on approval, always status 'processed'
```

## Flow
Me (edit profile) → save (PATCH /api/me)
Withdraw page → POST /api/withdrawals (snapshot destination, pending) → listed in GET /api/withdrawals
Approver (dev/CLI for now) → POST /api/withdrawals/[id]/decision → approve: balance re-check → ledger row → approved · decline: reason → declined
Balances drop only when a processed withdrawal row exists (user_balances unchanged)

## Notes
- `user_balances` is untouched: it already counts `withdrawal` only when `status = 'processed'`, which is now the only state a ledger withdrawal row is created in.
- Existing pending ledger rows must be migrated before the UI stops showing them, otherwise users' in-flight requests would silently vanish from the new list.
- `decided_by` is filled from the session and enforced to `role = 'admin'` — regular users get 403 from the decision endpoint. Admin UI for the review queue lands in roadmap 5.2.
- Declined requests keep their ledger absence — no money ever moved.
- Account number validation: digits only (6–16) at the app layer; bank id must exist in the seeded `banks` table.
- Me page exits: Withdraw → balance-card button (already exists); Referrals → new dashboard card links; Sign out → dashboard settings (already exists).
