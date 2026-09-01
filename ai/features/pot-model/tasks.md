# Tasks

- [ ] Migration `0005_pot_model.sql`: rename `jobs.pay_per_hour → total_payout`; rebuild `jobs_values_valid` with `total_payout >= 1.0` (platform floor)
- [ ] Update `supabase/seed.sql`: `total_payout` column + pot values (old rate × duration); apply 0005 + reseed the hosted DB; verify constraint accepts ≥ floor and rejects < floor
- [ ] `lib/jobs.ts`: `maxPoolSize(totalPayout)` + `estimateEarnings(totalPayout, poolSize)` helper
- [ ] `lib/lock.ts`: select `total_payout`; earnings = `total_payout ÷ pool size`
- [ ] API `GET /api/marketplace`: `total_payout` in type/select/response; `estimated_earnings = pot ÷ poolCount`
- [ ] API `GET /api/marketplace/[jobId]`: same for the detail payload
- [ ] API `POST /api/marketplace/[jobId]/commit`: capacity check via `maxPoolSize(job.total_payout)`
- [ ] API `GET /api/nodes`: `total_payout` select; realized per-node `estimated_earnings`
- [ ] UI `marketplace-client.tsx`: `total_payout` field; "Pay / hour" → "Total pool"
- [ ] UI `job-detail-client.tsx`: `total_payout` field; "Pay / hour" → "Total pool"
- [ ] Typecheck + lint clean
- [ ] E2E re-verification: browse → commit → lock → earnings (single + multi-node pool); confirm pot math (`total_payout ÷ pool size`)
