# Billing, seats, and plan limits — internal truth table

**Purpose:** Align **engineering**, **GTM**, and **support** on what the **UI says**, what the **database** stores, and what is **enforced** in API routes. Update this when `billing_plans`, Stripe products, or `company/billing` copy change.

**Last reviewed:** 2026-04-24

## Source of truth (code)

| Concern                                   | Where to look                                                                                        | Notes                                                                                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plan tiers (marketing / pricing page)** | [company/billing/page.tsx](<../../src/app/(dashboard)/company/billing/page.tsx>) `PLAN_DETAILS`      | `free`, `starter`, `growth`, `scale`, `enterprise` — feature bullets are **product copy** (e.g. “Unlimited seats” on enterprise).              |
| **Org on disk**                           | `organisations` (mapped in [mappers.ts](../../src/lib/mappers.ts))                                   | `billingTier` / `billing_tier`, `seats_used` / `seats_total`, unlocks, etc. `seatsTotal` has **defaults** from `plan` when the column is null. |
| **Billable / Stripe**                     | [stripe.ts](../../src/lib/services/stripe.ts), [webhooks/stripe](../../src/app/api/webhooks/stripe/) | Checkout, portal, and subscription events — verify **price id → plan_key** mapping in `billing_plans` and env.                                 |
| **Feature gates (product flags)**         | [entitlements/config.ts](../../src/lib/entitlements/config.ts), `GET /api/entitlements`              | `agents_run`, `fitscore_batch`, `assessments`, `offers`, `compensation_bands`, `interview_prep`, `scim` — not the same as “seat count.”        |
| **Admin plan limits**                     | [admin/plan-limits](../../src/app/api/admin/plan-limits/) and UI at `/admin/plan-limits`             | Platform override of plan metadata.                                                                                                            |
| **Unlocks**                               | Stripe + `getCompanyPlanUnlockLimit` in `stripe.ts`                                                  | Monthly profile-unlock cap per company plan; “unlimited unlocks” when `creditsQuota < 0` on billing page logic.                                |

## GTM rules (do not over-promise)

1. **“Unlimited seats” (enterprise UI copy):** Must match **contract** and the **enforced** behavior for **invites** and `seats_total`. If the **Team** / invite path does not hard-block at `seats_total` in all code paths, treat the number as a **soft** or **DB-driven** cap — do not assert hard enforcement until verified in [TeamManagementContent](../../src/components/dashboard/TeamManagementContent.tsx) and `POST` invite routes.
2. **Free vs Pro candidate:** The app may share the same **nav**; differences are **entitlements** and product policy — not duplicated here; confirm with [candidate] flows per release.
3. **Align deck with repo:** Before an enterprise signature, re-read `PLAN_DETAILS` and the **current** `billing_plans` table in Supabase (or staging) so **price, seats, and unlocks** in the table match what legal attached.

## Action items (when to edit this file)

- After any change to `PLAN_ORDER`, `PLAN_DETAILS`, or enterprise **unlimited** language.
- After a support incident where **seats** or **invites** did not match customer expectation.
- When Stripe **prices** or `billing_plans` rows are rotated.

**See also:** [FEATURE-INVENTORY-LIVING.md — §15](../requirements/FEATURE-INVENTORY-LIVING.md#15-billing-plans-entitlements)
