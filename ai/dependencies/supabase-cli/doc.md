# Supabase CLI Cheat Sheet (Cloud Project)

## Install

```bash
# Run directly via pnpm's npx equivalent (no install needed)
pnpx supabase --version

# Or add as a dev dependency first, then use pnpx to run it
pnpm add -D supabase
```

## Setup & Linking

| Command | Purpose |
|---|---|
| `pnpx supabase login` | Authenticate the CLI with your Supabase account (opens browser). |
| `pnpx supabase init` | Creates a `supabase/` folder with config in your project directory. |
| `pnpx supabase link --project-ref YOUR_PROJECT_REF` | Connects your local project folder to your cloud Supabase project. Project ref is found in your dashboard URL: `supabase.com/dashboard/project/YOUR_PROJECT_REF`. |

## Schema & Migrations

| Command | Purpose |
|---|---|
| `pnpx supabase db pull` | Pulls the current remote schema down into a local migration file. Use after making changes in the dashboard. |
| `pnpx supabase db push` | Pushes local migration files up to the cloud database. |
| `pnpx supabase migration new <name>` | Creates a new blank migration file to write SQL changes into. |
| `pnpx supabase migration list` | Shows which migrations have been applied locally vs. remotely. |

## Types

| Command | Purpose |
|---|---|
| `pnpx supabase gen types typescript --linked > types/supabase.ts` | Generates TypeScript types from your linked remote database schema. |

## Edge Functions

| Command | Purpose |
|---|---|
| `pnpx supabase functions new <name>` | Scaffolds a new Edge Function. |
| `pnpx supabase functions deploy <name>` | Deploys an Edge Function to your cloud project. |
| `pnpx supabase functions serve <name>` | Runs a function locally for testing. |

## Local Development (optional, Docker-based)

| Command | Purpose |
|---|---|
| `pnpx supabase start` | Spins up a full local stack (Postgres, Auth, Storage) via Docker — separate from your cloud project. Useful for testing migrations safely before pushing live. |
| `pnpx supabase stop` | Stops the local stack. |
| `pnpx supabase db reset` | Resets the local database and reapplies all local migrations. |

## Typical Cloud-Only Workflow

1. `pnpx supabase login`
2. `pnpx supabase init` (once, per project)
3. `pnpx supabase link --project-ref YOUR_PROJECT_REF`
4. Make schema changes → `pnpx supabase migration new <name>` → edit SQL → `pnpx supabase db push`
5. Or pull dashboard changes down → `pnpx supabase db pull`
6. `pnpx supabase gen types typescript --linked > types/supabase.ts` whenever schema changes