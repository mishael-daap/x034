# Technical Plan

## Components
- `supabase/seed.sql` — single idempotent seed (tiers, banks, companies, jobs)
- Run: `supabase db query --linked -f supabase/seed.sql` (Management API, no local Postgres needed)

## Data Model (seeded)
```
NodeTier { id (fixed), code C/B/A, name, vcpu, ram_gb, gpu, bandwidth, price }
Bank     { name } — 4 rows
Company  { id (fixed), name } — 8 rows
Job      { id (fixed), company, min_tier (by code lookup), required_referrals,
           pay_per_hour, duration_hours, starts_at (now() + interval), status: 'open' }
```

## Flow
`db query --linked` executes seed.sql as a single transaction:
tiers (upsert by code) → banks (upsert by name) → companies (upsert by id) → jobs (upsert by id; on conflict refresh starts_at + status).

## Notes
- No application code, no API changes — schema-only data feature
- Idempotency strategy: fixed UUIDs + `on conflict do nothing/update`
- Jobs use `(select id from node_tiers where code = 'X')` for min_tier → independent of tier row ids (safe with concurrent item-3 tier work)
- CLI 2.116 has no `db seed`; `db query --linked` is the equivalent
- Refresh behavior (`on conflict do update`) keeps the sandbox marketplace populated over time
