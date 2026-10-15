# Supabase migrations

All schema changes live in **timestamped files** under `supabase/migrations/`. The Supabase CLI is the single source of truth.

## One-time: link the project

If you haven’t linked this repo to your Supabase project:

```bash
npx supabase link --project-ref <YOUR_PROJECT_REF>
```

Get **Project ref** from: Supabase Dashboard → Project Settings → General → Reference ID (or from your URL: `https://<ref>.supabase.co`).  
You’ll be prompted for the database password (Project Settings → Database).

## Create a new migration

Generate a new migration file (timestamped) and open it in your editor:

```bash
npx supabase migration new <descriptive_name>
```

Example: `npx supabase migration new add_billing_plans_table` → creates `supabase/migrations/YYYYMMDDHHMMSS_add_billing_plans_table.sql`.  
Edit the file with your SQL (CREATE TABLE, ALTER, RPC, etc.). Do not edit existing migration files after they have been applied.

## Apply migrations (push)

```bash
npm run db:push
```

or:

```bash
npx supabase db push
```

This applies any new files in `supabase/migrations/` that haven’t been applied to the linked remote database. Run this after pulling migrations and before deploying.

## Generate TypeScript types

After linking the project, generate types from the current schema:

```bash
npm run gen:types
```

This writes `src/types/supabase.ts`. Run it after applying migrations so types stay in sync. Optionally add a CI step that runs `gen:types` when `supabase/migrations/` changes (requires `SUPABASE_ACCESS_TOKEN` and linked project).

---

## Using Supabase MCP

If you use the **Supabase MCP** in Cursor, you can run the migration SQL from the Dashboard or via the MCP “execute SQL” (or equivalent) tool:

1. Open the migration file: `supabase/migrations/20250225103200_tenant_security_storage_apps.sql`
2. Copy its contents and run them in **Supabase Dashboard → SQL Editor**, or
3. Use the MCP tool to execute the SQL against your project.

Ensure the MCP server is enabled and connected to the same Supabase project.
