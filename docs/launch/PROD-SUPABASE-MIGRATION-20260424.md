# Production Supabase: `wa_messages` + `interview_schedule_tokens` (20260424)

Apply migration file:

[`supabase/migrations/20260424200000_wa_messages_and_schedule_tokens.sql`](../../supabase/migrations/20260424200000_wa_messages_and_schedule_tokens.sql)

**Do not run from this repo in CI without confirmation** — a human with production access should apply and verify.

## Option A: Supabase CLI (linked project)

From the repository root, with the Supabase CLI installed and the project linked:

```bash
cd /path/to/TigerHire
npx supabase db push
```

To push only if you use migration history (typical), ensure your local migration folder matches what should run on production. If `db push` is not available or you use hosted SQL, use Option B.

## Option B: Supabase Dashboard (SQL editor)

1. Open **SQL Editor** in the Supabase project (production).
2. Paste the full contents of `20260424200000_wa_messages_and_schedule_tokens.sql`.
3. Run once.
4. In **Table Editor**, confirm tables `wa_messages` and `interview_schedule_tokens` exist.

## Verify

- `public.wa_messages` exists, RLS enabled, indexes on `application_id`, `wa_message_id`.
- `public.interview_schedule_tokens` exists with `token_hash` unique.

**MCP (Cursor) Supabase project:** The migration `20260424200000_wa_messages_and_schedule_tokens` can be confirmed via `list_migrations`; both tables with `SELECT to_regclass('public.wa_messages'), to_regclass('public.interview_schedule_tokens');`. If both return non-null names, the DDL is present on the linked project.
