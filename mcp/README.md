# MCP (Model Context Protocol) servers

This folder holds versioned config and docs for MCP servers used with Cursor/IDEs. The Supabase MCP lets the AI run SQL, list tables, apply migrations, and use other Supabase tools against this project’s database.

## Supabase MCP

- **Package:** [@supabase/mcp-server-supabase](https://www.npmjs.com/package/@supabase/mcp-server-supabase)
- **Docs:** [Supabase MCP](https://supabase.com/docs/guides/getting-started/mcp)

### Setup

1. **Copy the example config** into Cursor’s MCP config:

   - **Cursor:** Copy `mcp/cursor-supabase.example.json` into `.cursor/mcp.json` (create `.cursor` if needed).
   - Or merge the `mcpServers` block from the example into your existing `.cursor/mcp.json`.

2. **Set credentials** in the config (or via env):

   - `SUPABASE_PROJECT_REF`: Project reference (e.g. `htdyomyhkvhcwoeodwas` for this repo).
   - `SUPABASE_ACCESS_TOKEN`: [Create in Supabase Dashboard](https://supabase.com/dashboard/account/tokens) (Account → Access Tokens). Prefer env var so the token isn’t committed.

3. **Restart Cursor** and, if prompted, complete Supabase login.

### Running the server from the project

From the repo root:

```bash
npm run mcp:supabase
```

Uses `npx @supabase/mcp-server-supabase` with stdio. For Cursor, the config runs this automatically; the script is for manual or scripted use.

### Production / staging sync

- **`supabase db push`** (or linked CLI) applies migrations in filename order. If the remote project was missing an older migration (e.g. platform ledger), apply it **before** dependent migrations (e.g. `tenant_isolation_hardening` references `platform_price_catalog` / `platform_cost_events`).
- Use **`list_migrations`** in MCP to confirm the remote history matches `supabase/migrations/`.
- After RLS changes, run **`get_advisors`** (type `security`) and address any new ERROR-level lints.

### What the Supabase MCP can do

- **Database:** Run SQL, list tables/extensions, apply migrations
- **Edge Functions:** Deploy, get, list
- **Dev:** Generate TypeScript types, project URLs/API keys
- **Debug:** Service logs, advisors

It does **not** manage auth config or email templates; use the Supabase Dashboard or CLI for those (see `docs/SUPABASE_AUTH_EMAIL_BRANDING.md`).
