# Customer usage meters

## Purpose

Record **billable usage units per organisation** for usage-based pricing, invoicing, or reconciliation with Stripe metered prices. This is separate from:

- **`feature_flags`** — engineering rollout and kill switches.
- **Plan entitlements** (`ENTITLEMENT_FEATURE_KEYS`, `billing_plans`) — coarse “included in plan” gates.

## Implementation

- **Definitions:** [`src/lib/billing/customer-usage-meters.ts`](../../src/lib/billing/customer-usage-meters.ts) — stable `id`, display name, description, default unit.
- **Recording:** [`src/lib/billing/record-customer-usage-meter.ts`](../../src/lib/billing/record-customer-usage-meter.ts) — `recordCustomerUsageMeterEvent(...)` writes to **`platform_cost_events`** with:
  - `provider`: `tigerhire`
  - `service`: `customer_usage_meter`
  - `category`: `customer_usage`
  - `external_id`: deterministic from `organisationId`, `meterKey`, and `idempotencyKey` (safe upsert)

- **Admin reference:** `GET /api/admin/billing/usage-meters` (super_admin) and the collapsible section on **Admin → Feature Flags**.

## Stripe (next step)

1. Create metered prices or Stripe Billing Meters aligned to these `id` values.
2. After each `recordCustomerUsageMeterEvent` success (or in a nightly job), emit **Stripe Usage Records** keyed by customer + meter, using the same `idempotencyKey` pattern to avoid double billing.
3. Optionally set `amountUsd` on ledger rows when you have an internal unit price for analytics only — Stripe remains source of truth for invoice line amounts if you use native metering.

## Feature flag catalog

Runtime flags show a **Meter:** line when `customerBilling` is `usage_meter_ready` and a `meterKey` is set — see [`src/lib/feature-flags/catalog.ts`](../../src/lib/feature-flags/catalog.ts).

## Plan feature catalog

`GET /api/entitlements` now includes a **`catalog`** object keyed by entitlement feature with `displayName`, `description`, and `commercialModel` for UI copy — see [`src/lib/entitlements/customer-features-catalog.ts`](../../src/lib/entitlements/customer-features-catalog.ts).
