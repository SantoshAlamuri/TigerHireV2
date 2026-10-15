# Database migrations

**Source of truth for this repo:** timestamped files under `supabase/migrations/`. For the hosted project, **pick one method and stay on it** — either apply every change through the **Supabase MCP** `apply_migration` tool, **or** use the **Supabase CLI** (`supabase link` + `db push` with `SUPABASE_ACCESS_TOKEN` / `supabase login`). **Do not mix** MCP and CLI on the same remote without a planned `supabase migration list` / `supabase migration repair` pass, because remote `schema_migrations` rows can diverge from local file timestamps.

Schema is also reflected in older numbered files under `supabase/schema/`. New work should use `supabase/migrations/`; apply in timestamp order.

## Applying migrations

- **Supabase hosted**: Run each new file in the Supabase SQL Editor, or use Supabase CLI:
  - `supabase link` then `supabase db push` (if using CLI migrations), or
  - Run the contents of `supabase/schema/*.sql` in order for a fresh project.
- **Local (Docker)**: Same: run files in order against your local Postgres (e.g. after `docker compose up -d db`).

## Adding a new migration

1. Add a new file `supabase/schema/NN_description.sql` where `NN` is the next number (e.g. `40_new_feature.sql`).
2. Use `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, and `CREATE OR REPLACE FUNCTION` so re-running is safe.
3. Document in this file or in `supabase/schema/README.md` if the migration has dependencies.

## Rollback

There are no automatic down-migrations. To roll back a change, write and run a separate SQL script that reverses the migration (e.g. `DROP TABLE IF EXISTS ...`). Prefer additive changes (new tables, new columns with defaults) to minimise rollback need.
