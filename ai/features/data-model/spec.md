# Feature: Data Model & Supabase Migration

## Purpose
Design the database schema for the compute marketplace and deliver the Supabase migration that creates all tables, so every downstream feature (auth, nodes, marketplace, earnings, referrals, withdrawals) has a foundation. Includes RLS policies and seed data (node tiers, banks).

## User Flow
1. Supabase project connected to the repo (CLI + env vars)
2. Migration run → all tables created
3. Seed script runs → node_tiers (C/B/A) + banks populated
4. Developer verifies schema + constraints via SQL queries

## Rules
- Every entity gets id (PK) + created_at automatically (Supabase convention)
- All cross-entity references are FK columns
- referral_code unique, generated at signup; referrer immutable once set
- Constraint: referrer ≠ self
- One committed/active assignment per node at a time (partial unique index)
- earnings are derived, not stored: pay_per_hour × actual_duration_hours (computed at completion when creating the earnings transaction)
- Amounts non-negative for jobs; Transaction amount is signed
- RLS: private tables owner-only; companies, jobs, node_tiers publicly readable
- Users are never hard-deleted (referral counts depend on them)
- A job is worked by exactly one node; unselected pool candidates are cancelled at job start
- User balance is a denormalized column, updated atomically with each Transaction insert

## Acceptance Criteria
- [ ] Migration applies cleanly on a fresh Supabase project
- [ ] All tables exist with correct columns, types, PKs, FKs
- [ ] node_tiers seeded with C/B/A matching business-rules.md
- [ ] banks seeded with sample banks
- [ ] RLS policies active (owner-only private data, public catalog/marketplace)
- [ ] Constraints verified: unique referral_code, one active assignment per node, immutable referrer
