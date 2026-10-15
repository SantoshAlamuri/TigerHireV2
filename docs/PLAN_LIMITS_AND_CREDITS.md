# Plan Limits and Credits

How profile-unlock credits (usage limits) work in TigerHire: where they are defined, how they are enforced, and how platform admins can change them without a code deploy.

---

## Overview

- **Credits** = monthly allowance of **profile unlocks** per company plan. One unlock = one candidate contact (PII) revealed to the organisation.
- Limits are **stored in the database** (`billing_plans`), not in code. Enforcement is **automatic** on every unlock and org fetch.
- **Platform admins** can change limits in **Admin → Plan limits**; changes take effect immediately.

---

## How It Works

### 1. Source of truth: `billing_plans`

| Column            | Purpose                                                     |
| ----------------- | ----------------------------------------------------------- |
| `plan_key`        | Plan identifier, e.g. `free`, `starter`, `growth`, `scale`. |
| `plan_type`       | `company` for company plans (unlock limits apply here).     |
| `limits`          | JSONB, e.g. `{ "unlocks": 15 }`. Use `-1` for unlimited.    |
| `name`            | Display name (e.g. "Starter").                              |
| `stripe_price_id` | Stripe Price ID; can be empty and filled from env.          |

The app reads limits from this table via `getBillingPlans()` / `getCompanyPlanUnlockLimit()` in `src/lib/services/stripe.ts`. If the table is empty or a plan is missing, it falls back to env/defaults (e.g. default unlock limit 5).

### 2. Automated enforcement (no human steps)

- **Usage**: “Credits used” = count of rows in `candidate_unlocks` for the organisation in the **current calendar month**. No cron or manual reset.
- **On unlock** (`POST /api/candidates/[id]/unlock`):
  1. Load org’s `company_plan` (e.g. `starter`).
  2. Get that plan’s limit from `billing_plans` via `getCompanyPlanUnlockLimit(plan)`.
  3. Count unlocks this month for the org.
  4. If limit is not unlimited (`-1`) and count ≥ limit → return `403` with `code: "INSUFFICIENT_CREDITS"`.
  5. Otherwise create the unlock record and return candidate data.
- **On org fetch** (`GET /api/organisations`): Same logic is used to attach `unlock_quota` and `unlocks_used` to the organisation so the dashboard and billing page show correct credits (and “Unlimited” when limit is `-1`).

So: **credits and access are applied automatically** from DB config; no manual steps.

### 3. Where limits are used in the app

| Place                | Behaviour                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------ |
| Unlock API           | `getCompanyPlanUnlockLimit(org.company_plan)` → allow or return `INSUFFICIENT_CREDITS`.                      |
| Organisations API    | `getBillingPlans()` → add `unlock_quota` to org payload.                                                     |
| Mapper               | `mapDbOrgToView` uses `row.unlock_quota` when present; `-1` = unlimited.                                     |
| Company Billing page | Shows “Credits used” (e.g. `X / Y` or `X / ∞`); “Out of credits” banner when used ≥ quota and not unlimited. |
| Out-of-credits modal | Shown when unlock fails with `INSUFFICIENT_CREDITS` or when user is at limit; CTA to upgrade.                |

---

## Changing Limits (Platform Admin)

### Admin UI

1. Sign in as a user with role **super_admin**.
2. Open **Admin → Plan limits** (sidebar).
3. The table lists company plans from `billing_plans` and their **Unlocks / month** (number or “Unlimited”).
4. Click **Edit**, change the value (use **-1** for unlimited), then **Save**.
5. Changes are written to `billing_plans.limits`; no deploy or restart. The next unlock and org fetch use the new limits.

### API (super_admin only)

- **GET /api/admin/plan-limits**  
  Returns `{ plans: PlanRow[] }` (company plans with `id`, `plan_key`, `plan_type`, `name`, `limits`, `stripe_price_id`, `updated_at`).

- **PATCH /api/admin/plan-limits**  
  Body: `{ plan_key: string, plan_type: "company", limits: { unlocks: number } }`.  
  Updates that plan’s `limits` in `billing_plans`. Use `-1` for unlimited.

---

## Seed Data

Migration **`supabase/migrations/20250304120000_seed_billing_plans_limits.sql`** inserts default company plans if they don’t exist:

| plan_key | name    | defaults (limits.unlocks) |
| -------- | ------- | ------------------------- |
| free     | Free    | 5                         |
| starter  | Starter | 15                        |
| growth   | Growth  | 50                        |
| scale    | Scale   | -1 (unlimited)            |

**ON CONFLICT (plan_key, plan_type) DO NOTHING** so existing rows (e.g. edited by admin) are not overwritten. To reset to defaults you would need to update or delete rows manually or via a separate script.

---

## Fallbacks

- **Missing plan or empty table**: `getCompanyPlanUnlockLimit(plan)` returns `5` when the plan is not in `billing_plans` or the table is empty.
- **Empty `stripe_price_id`**: `getBillingPlans()` merges in env-based price IDs so checkout still works when DB has no price ID.

---

## Related Code

| File                                             | Purpose                                                           |
| ------------------------------------------------ | ----------------------------------------------------------------- |
| `src/lib/services/stripe.ts`                     | `getBillingPlans()`, `getCompanyPlanUnlockLimit(plan)`.           |
| `src/app/api/candidates/[id]/unlock/route.ts`    | Enforces limit; returns `INSUFFICIENT_CREDITS` when over.         |
| `src/app/api/organisations/route.ts`             | Adds `unlock_quota` and `unlocks_used` to org.                    |
| `src/lib/mappers.ts`                             | `mapDbOrgToView` uses `unlock_quota`; supports `-1` as unlimited. |
| `src/app/api/admin/plan-limits/route.ts`         | GET/PATCH plan limits (super_admin).                              |
| `src/app/(dashboard)/admin/plan-limits/page.tsx` | Admin UI to view and edit limits.                                 |

---

## Summary

- **Credits** = monthly profile-unlock allowance per company plan, from **`billing_plans`**.
- **Enforcement** is automatic on unlock and org fetch; no manual steps.
- **Platform admins** change limits in **Admin → Plan limits** (or via the plan-limits API); changes apply immediately with no deploy.
