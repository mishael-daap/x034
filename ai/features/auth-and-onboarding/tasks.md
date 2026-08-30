# Tasks

- [x] Write migration 0002 (drop FK, add email/phone/password_hash, id default)
- [x] Apply migration 0002 to the hosted project and verify schema
- [x] `lib/auth/password.ts` — scrypt hash/verify
- [x] `lib/auth/session.ts` — HMAC token sign/verify + cookie helpers
- [x] `lib/supabase.ts` — PostgREST fetch helper
- [x] `POST /api/auth/signup`
- [x] `POST /api/auth/login`
- [x] `POST /api/auth/logout`
- [x] `GET /api/auth/me`
- [x] `/signup` page (mobile-first)
- [x] `/login` page (mobile-first)
- [x] Home (`app/page.tsx`) — session state + sign out
- [x] End-to-end smoke test all routes + pages
- [ ] Update `roadmap.md` → item 2 completed
- [ ] Commit (with user approval)
