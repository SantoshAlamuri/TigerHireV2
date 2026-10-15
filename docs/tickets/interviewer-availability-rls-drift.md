# Interviewer availability RLS: `company_admin` vs production `app_role`

| Field     | Value                                                                              |
| --------- | ---------------------------------------------------------------------------------- |
| Status    | **Fixed** — migration `20260517180000_interviewer_availability_rls_align_prod.sql` |
| Priority  | Medium (prod already patched at apply time)                                        |
| Brief     | 8 Phase A                                                                          |
| Migration | `20260517130000_interviewer_availability_windows.sql`                              |

## Problem

Repo migration `20260517130000_interviewer_availability_windows.sql` includes `company_admin` in RLS policies for `interviewer_availability_windows` (SELECT and INSERT).

Production Supabase project `htdyomyhkvhcwoeodwas` **`app_role` enum does not include `company_admin`**. Applying the migration as-is failed until policies were applied **without** `company_admin` (or equivalent).

**Drift today:**

| Environment | `company_admin` in interviewer availability RLS |
| ----------- | ----------------------------------------------- |
| Repo file   | Yes (lines 43, 61)                              |
| Production  | No (hotfixed at apply)                          |

## Impact

- `company_admin` users in prod cannot use interviewer availability APIs guarded by these policies until aligned.
- Fresh environments that use the repo migration verbatim may fail DDL if enum lacks `company_admin`.
- `dev` also has `20260517140000_referral_campaigns_rls_leadership.sql` — confirm whether referral RLS was aligned separately.

## Options (pick one tomorrow)

1. **Add `company_admin` to `app_role` enum** in a migration, then keep repo RLS as written.
2. **Remove `company_admin` from repo migration** and rely on `leadership` / `hiring_manager` / `recruiter` only (match prod hotfix).
3. **Map `company_admin` → `leadership`** in product/RBAC docs if they are the same persona going forward.

## Evidence

- Phase A production apply (2026-05-16): apply succeeded only after omitting `company_admin` from policies.
- Conversation / audit note in Brief 8 handoff.

## Acceptance

- Repo migration matches production RLS (no enum/policy mismatch).
- `company_admin` (or documented replacement role) can declare availability where product expects.
- Document decision in `docs/product/decisions.md` if role naming changes.

## Do not

- Re-apply Phase A migration blindly on production without reconciling enum + policies.
