# Runbook: Apply DB Migration (Staging → Prod)

**Owner:** Santosh | **Frequency:** As needed (every migration)
**Last Updated:** 2026-06-04 | **Last Run:** —

> This repo has **two independent manual tracks**: app deploy (Vercel, on merge to
> `dev`/`main`) and DB migration (`supabase db push`, operator-run). **They do not
> ride together.** A deploy never applies DDL. Treat every migration as its own
> verified step. Precedent: `whatsapp_message_log` once existed on prod but not
> staging — same "app deployed, DB behind" class of bug.

---

## Purpose

Apply a pending migration to staging, verify it landed, then repeat the _identical_
sequence on prod. Staging runs first as a no-stakes rehearsal of the exact apply +
verify steps, so prod is never the first environment to exercise them.

## Project refs

| Environment | Project ref                                | Notes                              |
| ----------- | ------------------------------------------ | ---------------------------------- |
| Staging     | `qzhhhsvtyqyixpcdfhng` (TigerHire-Staging) | Rehearse here first, always        |
| Prod        | `htdyomyhkvhcwoeodwas` (TigerHire)         | Only after staging verify is green |

## Prerequisites

- [ ] Migration files merged to `dev` (CI green — merge does **not** apply them)
- [ ] Supabase CLI authenticated (`supabase login`)
- [ ] Confirmed which objects the migration creates (the verification check below
      must be edited to match the actual migration, not copied blind)
- [ ] No `ff_*` flag depending on these objects is currently ON in the target env

---

## Procedure

Run the whole block on **staging first**. Only proceed to prod after staging
verification passes.

### Step 1: Link the target project

```
supabase link --project-ref <PROJECT_REF>
```

**Expected result:** CLI reports linked to the named project. Double-check the ref
echoed back — linking the wrong project is the one mistake that turns "staging
rehearsal" into "accidental prod push."
**If it fails:** re-run `supabase login`; confirm the ref is correct.

### Step 2: Inspect what will be applied (dry view)

```
supabase migration list
```

**Expected result:** the pending migration timestamps appear as local-but-not-remote.
For this gate that is `20260604150000` and `20260604160000`.
**If it fails / shows nothing pending:** the migrations aren't on the branch you
pulled, or they're already applied. Stop and reconcile before pushing.

### Step 3: Apply

```
supabase db push
```

**Expected result:** CLI applies pending migrations in timestamp order and reports
success per file. `db push` orders by timestamp automatically — no manual ordering.
**If it fails mid-apply:** capture the exact error. A failed _file_ (SQL error) is a
different problem from _not applied_ (see Troubleshooting) — do not conflate them.

### Step 4: Verify — three-object check

Run in the SQL editor (or `supabase db query`) against the **same** project just
pushed to. Edit object names to match the migration if reusing this runbook later.

```sql
-- tables present?
select
  to_regclass('public.organisation_runtime_feature_flag_overrides') as overrides_tbl,
  to_regclass('public.prescreen_sessions')                          as prescreen_tbl;

-- applications columns present?
select column_name
from information_schema.columns
where table_schema = 'public'
  and table_name   = 'applications'
  and column_name in ('gate_status', 'unverified_must_haves');

-- migration ledger recorded the apply?
select version
from supabase_migrations.schema_migrations
where version in ('20260604150000', '20260604160000');
```

**Expected result (all three must hold):**

- Both `to_regclass` values are **non-null** (not `NULL`).
- The columns query returns **both** `gate_status` and `unverified_must_haves`.
- The ledger query returns **both** version rows.

**If any object is missing:** this is "migrations not applied," not a broken file.
Re-check Step 1 linked the right ref, then re-run Step 3. Do **not** proceed to prod
or flip any flag.

---

## Promote to prod

Only after **all three staging checks pass**:

1. Repeat Steps 1–4 with `--project-ref htdyomyhkvhcwoeodwas`.
2. Prod's three-object check must pass on its own — staging passing does **not**
   imply prod is migrated. They are separate tracks.
3. App promote (`dev` → `main`) is a **separate** action from this runbook. Schema
   must be verified present _before_ the app that reads it goes live.
4. Flag flip (`ff_whatsapp_gate`) comes **after** schema verify, never before.

---

## Verification

- [ ] Staging: all three objects present + ledger rows present
- [ ] Prod: same three objects present + ledger rows present (separate run)
- [ ] No flag depending on these objects was ON before its schema was verified

## Troubleshooting

| Symptom                                            | Likely cause                                   | Fix                                                        |
| -------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| `db push` succeeds, objects still missing on check | Linked to wrong project ref                    | Re-run Step 1 with correct `--project-ref`, re-push        |
| Deploy finished but objects missing                | Migration never run (deploy ≠ db push)         | Run this runbook; the deploy does not apply DDL            |
| `db push` errors inside a file                     | Broken migration SQL                           | Fix the migration file; objects present-but-wrong ≠ absent |
| `migration list` shows nothing pending             | Wrong branch, or already applied               | Confirm branch has the files; check ledger                 |
| Objects present, app still errors                  | App not deployed with reader code, or flag off | Verify app build includes the code; check flag state       |

## Rollback

- **Schema:** these are additive (new table + new columns). No read path should
  depend on them until the corresponding flag is ON, so a forward-only "leave it,
  flag stays OFF" is the safe default. Only write a down-migration if an applied
  object actively breaks something.
- **Flag:** flip `ff_whatsapp_gate` OFF (global or per-org) to disable the behaviour
  that exercises the new objects — instant, reversible, no schema change.
- **App:** revert the `dev`→`main` promote independently; schema can stay.

## History

| Date       | Run By | Notes                                                                                                                                                                  |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-04 | —      | Staging three-object check run read-only: all three **missing**, no ledger rows, no `ff_*` ON. Confirms `dev` deploy alone did not migrate staging. Apply not yet run. |
