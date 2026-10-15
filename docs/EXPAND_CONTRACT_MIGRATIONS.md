# Expand-Contract Migration Pattern

Use this pattern for schema changes that must stay backward-compatible during deployment.

## Steps

1. **Expand**: Add the new column (or table) as **nullable** or with a default. Deploy application code that writes to both old and new (if renaming) or only to the new. Old code keeps reading the old column.
2. **Backfill**: Run a one-off script or migration that backfills the new column from the old data.
3. **Switch**: Deploy new code that reads from the new column only. Optionally stop writing to the old column.
4. **Contract**: After a safe period, drop the old column (or deprecate the old path). Deploy.

## Example: Rename column `title` to `name`

```sql
-- 1. Expand: add new column
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS name TEXT;

-- 2. Backfill (same migration or separate)
UPDATE jobs SET name = title WHERE name IS NULL;

-- 3. (Application now reads/writes `name`. After deploy.)
-- 4. Contract: drop old column
-- ALTER TABLE jobs DROP COLUMN title;
```

Application code during step 2 might look like:

```ts
const row = data as { title?: string; name?: string };
const displayName = row.name ?? row.title ?? "";
```

After step 3, use only `name`. After step 4, remove any fallback to `title`.

## Supabase

Migrations live under `supabase/schema/`. Number new files (e.g. `72_add_jobs_name.sql`) and run in order. Prefer small, reversible migrations.
