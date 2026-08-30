# Technical Plan

## Components
- `supabase/migrations/0002_auth.sql` — make `users` a standalone account table
- `lib/supabase.ts` — server-side PostgREST fetch helper (publishable key)
- `lib/auth/password.ts` — scrypt hash/verify (node:crypto)
- `lib/auth/session.ts` — HMAC token sign/verify + cookie helpers
- `app/api/auth/signup/route.ts` — POST signup
- `app/api/auth/login/route.ts` — POST login
- `app/api/auth/logout/route.ts` — POST logout
- `app/api/auth/me/route.ts` — GET current user
- `app/signup/page.tsx` — signup form (mobile-first)
- `app/login/page.tsx` — login form (mobile-first)
- `app/page.tsx` — home with session state + sign out

## API
- `POST /api/auth/signup` — body `{ name, password, email?, phone?, referral_code? }` → `201 { user }` + session cookie
- `POST /api/auth/login` — body `{ identifier, password }` → `200 { user }` + session cookie
- `POST /api/auth/logout` → `204`, clears cookie
- `GET /api/auth/me` → `200 { user }` | `401`

## Data Model
```
User {
  id uuid PK default gen_random_uuid()
  name text not null
  email text unique          -- nullable, identification only
  phone text unique          -- nullable, identification only
  password_hash text not null -- scrypt "salt:hash"
  referral_code text unique  -- generated at signup
  referrer uuid → users.id (nullable)
  bank uuid → banks.id
  account_number text
  created_at timestamptz
}
```

## Flow
Signup: validate → normalize → resolve referrer → hash password → generate unique referral code → insert row (PostgREST) → set session cookie.
Login: fetch row by email **or** phone → verify scrypt hash → set session cookie.
Session: `base64url(payload).base64url(hmac-sha256(payload))` where payload = `{ sub, exp }`; cookie httpOnly, sameSite=lax, path=/, secure in prod, 7 days.
Me: read cookie → verify token → fetch fresh row → strip `password_hash`.

## Notes
- Zero new dependencies: `node:crypto` for scrypt + HMAC, global `fetch` for PostgREST
- Env: `SUPABASE_URL`, `SUPABASE_API_KEY` (set), `AUTH_SECRET` (new, server-only)
- Duplicate unique violations arrive as PostgREST 409 (code 23505) → map to field
- Login 401 is generic ("invalid credentials") — never reveals whether the identifier exists
- Tables have no RLS (sandbox); `password_hash` is readable by anyone with the URL + key — acceptable for Phase 1, hardening is a follow-up
- Out of scope: node purchase (roadmap item 3), email/phone verification, OTP, password reset
