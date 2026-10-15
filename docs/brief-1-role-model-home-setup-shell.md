# TigerHire — Brief 1: Role model + Home shell + Setup mode scaffolding

| Status           | Ready for implementation                                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Revision**     | **v1.1** — incorporates repo-aligned routing, repo-wide migration acceptance, Postgres enum notes, `leadership` vs `is_org_admin` semantics, cross-role org settings intent, workflow-string audit, redirect/auth continuity, and CI review guidance (see §11). |
| Author           | Santosh                                                                                                                                                                                                                                                         |
| Implementer      | Cursor                                                                                                                                                                                                                                                          |
| Estimated effort | One change, three sequential PRs against `dev`                                                                                                                                                                                                                  |
| Related docs     | `TigerHire-Dimensions-Ontology-BRD.docx`, `TigerHire-Scoring-Hardening-PRD.docx`, IA mapping table (separate)                                                                                                                                                   |

---

## 1. Goal

One cohesive change to the role model, landing path, and Setup separation that fixes the foundational IA problems identified in the codebase audit:

1. Replace the `company_admin` role with `leadership` plus an orthogonal `is_org_admin` permission flag.
2. Standardize every customer-dashboard role to land on a single canonical `/home`.
3. Ship `/home` as a real, role-aware tile surface — not a redirect stub.
4. Scaffold Setup mode behind a gear icon gated on `is_org_admin`. Operational sidebar loses every Setup-class item.

After this brief: routes are still duplicated (`/company/jobs` and `/recruit/jobs` still exist) and Setup mode is still empty of real configuration screens. Those are Brief 2 and Brief 3.

## 2. Non-goals

- **Route unification.** `/company/*`, `/recruit/*`, `/company/my-*`, `/employee/*` all stay as-is for now. Brief 2 collapses them.
- **Filling Setup mode** with the seven groups of configuration screens. Brief 3 does that.
- **Candidate, agency, and platform-admin shells.** Out of scope entirely. `super_admin`, `agency`, `candidate_pro`, `candidate_free` are not touched.
- **Renaming `is_platform_admin`** or any other existing flag. `is_org_admin` is a brand new column.
- **Per-customer configurable role display labels** ("CHRO" vs "Head of People"). Hardcode "Leadership" in admin-facing strings for now; customer-visible copy can still use "CHRO / Head of People" where it makes sense.
- **Top-nav vs sidebar rendering decision.** Brief 3 handles that. Brief 1 just removes items from the current sidebar.

## 3. Naming and concepts

- **Role enum value `leadership`** is the access bundle that replaces `company_admin`. Function-neutral on purpose. Display label in the UI can be "CHRO / Head of People" or anything else; do not bind the enum to a job title.
- **`is_org_admin`** is an orthogonal boolean permission flag on `profiles`. It controls access to Setup mode and Setup-class routes. Any role can have it true or false.
- **`is_platform_admin`** stays as-is. It governs TigerHire-internal `/admin/*` routes. **It is never collapsed with `is_org_admin` in the same conditional.** Two distinct flags, two distinct code paths.

### 3.1 `leadership` vs `is_org_admin` (product semantics — v1.1)

Implementers must not treat these as interchangeable. Use this matrix as the default; adjust only if product explicitly changes it.

| Concern                                                                                                                                                                               | Default gate                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Org-wide **operational** capabilities that today are `company_admin`-only (e.g. org-wide company hub, org-scoped approvals surface as currently designed)                             | `role === 'leadership'` (plus existing role mixes such as `recruiter` where policy already allows) |
| **Setup mode**, **`/setup/**`**, **org-wide `/company/settings/\*`**, **team**, **billing**, **webhooks**, **audit**, and other **configuration\*\* surfaces called out in this brief | `is_org_admin === true` **regardless of base role**                                                |

**`leadership` without `is_org_admin`:** Allowed by the model (e.g. exec who should not change billing). Operational access follows `role === 'leadership'`; Setup gear and Setup-class routes are hidden / 403 unless `is_org_admin`. The migration **backfill** sets `is_org_admin = true` for all users converted from `company_admin` so existing behaviour is preserved until you intentionally assign flags.

**`recruiter` (or other role) with `is_org_admin`:** May open org-wide company settings and Setup when policy says so. If product intends **recruit-scoped** settings (`/recruit/settings/*`) to remain separate from **org-wide** settings (`/company/settings/*`), Brief 3 must spell out which Setup areas map to which tree; Brief 1 only gates `/setup/**` on `is_org_admin` and must not accidentally imply all settings merge into one blob without that mapping.

---

## 4. Phase 1 — Role model migration

### 4.1 Scope

- Rename `company_admin` → `leadership` in the role enum.
- Add `profiles.is_org_admin boolean not null default false`.
- Backfill: every existing user whose role is `company_admin` becomes `role = 'leadership'` and `is_org_admin = true` in the same migration.
- Update every code path that references `company_admin`.

### 4.1.1 Postgres enum and migration realism (v1.1)

- **Validate on a staging clone** before production: forward + backward migration, including lock duration and any dependent views/policies.
- Document the **exact strategy** in the migration PR description: e.g. `ALTER TYPE ... RENAME VALUE` (Postgres version permitting) vs **add new enum value → backfill column → drop old value** (safer on some versions).
- Enum renames can lock the `profiles` table; schedule during a **low-traffic window** if production risk is non-trivial.

### 4.2 Files to update

- **Supabase migration** (new file under `supabase/migrations/`):
  - Rename enum value `company_admin` → `leadership` on the `user_roles` Postgres enum (per strategy in §4.1.1).
  - `ALTER TABLE profiles ADD COLUMN is_org_admin boolean NOT NULL DEFAULT false;`
  - Backfill: `UPDATE profiles SET is_org_admin = true WHERE role = 'leadership';` (runs after the enum rename in the same migration).
  - Forward and backward (`-- down`) sections both required.
- **`src/types/database.ts`** — `USER_ROLES` constant: replace `'company_admin'` with `'leadership'`. Update any TypeScript union types derived from it.
- **`src/lib/security/dashboard-route-policy.ts`** — `DASHBOARD_ROUTE_ACCESS_RULES`:
  - Every `company_admin` reference → `leadership` **where the check is role-bundle operational access**.
  - For Setup-class routes (every `/company/settings/*`, `/company/team`, `/company/billing`, every entry under "Hiring setup" in nav), the access predicate becomes **`is_org_admin === true`** regardless of role (subject to §3.1).
  - For operational routes (`/company`, `/company/jobs`, `/company/approvals`, `/company/offers`, etc.), substitute `leadership` for `company_admin` in the **existing** role arrays (do not collapse recruiter + leadership into one string without reviewing each rule).
- **`src/components/dashboard/sidebar-nav-groups.tsx`** — `NAV_GROUPS_BY_ROLE`:
  - `NAV_GROUPS_BY_ROLE['company_admin']` becomes `NAV_GROUPS_BY_ROLE['leadership']`.
  - The "Hiring setup" group and every `/*/settings/*` entry, `/company/team`, `/company/billing`, `/company/settings/outbound-webhooks`, `/company/settings/audit`, `/company/pending-resignations` are **removed** from the leadership group entirely (and from any other role groups where they appear). They are reachable only via Setup mode after Phase 3.
- **`src/lib/api-helpers.ts`** — anywhere `role === 'company_admin'` is checked, replace with whichever is correct (per §3.1):
  - Operational/role-bundle checks → `role === 'leadership'`.
  - Setup/config/permission checks → `is_org_admin === true`.
  - Where the existing check was effectively "can configure the org", it becomes `is_org_admin === true`. Where it was "is this person the leadership user in this org", it stays `role === 'leadership'`. Cursor must walk each call site and decide.
- **Zod / validation schemas** that include the role enum: regenerate or hand-edit.
- **RLS policies** referencing `company_admin`: update to `leadership` (operational gating) or to a check on `is_org_admin` (config gating). Audit every policy.
- **Seed scripts** under `supabase/seed*` if present.
- **Invite / onboarding email templates** that mention "Company Admin": switch to "Leadership". Customer-visible string can be softened to "CHRO / Head of People" where appropriate but the role enum string and admin-facing strings say "Leadership".
- **Workflow and business logic strings (v1.1):** Audit code paths that embed **`company_admin` as a routing or approval target** (e.g. requisition workflows, default approver role, notification routing). Renaming the enum is not enough—replace semantics with **`leadership`** and/or **org admins** (`is_org_admin`) per product rules, not a blind string swap.
- **Tests, scripts, and docs:** Any fixture or snapshot that hardcodes `company_admin` must be updated in the same PR series as the migration.

### 4.3 `ROLE_DASHBOARD_PATH` update

Every customer-shell role now lands on `/home`:

```
leadership      → /home
recruiter       → /home
hiring_manager  → /home
interviewer     → /home
finance         → /home
employee        → /home
```

Unchanged (separate shells, not in this brief):

```
super_admin     → /admin      (TigerHire-internal)
agency          → /agency
candidate_pro   → /candidate
candidate_free  → /candidate
```

### 4.4 Redirects and auth continuity (v1.1)

After `ROLE_DASHBOARD_PATH` moves to `/home`, audit and update every path that sends users post-login or post-OAuth:

- **`src/proxy.ts`** (and any middleware) — redirects that currently force a role-specific root must send customer-shell roles to **`/home`** where this brief applies.
- **`src/lib/auth/oauth-session-completion.ts`** (and related auth callbacks) — remove or replace any **`role === 'company_admin'`** hard-codes; ensure **`next`** / default destination respects **`/home`** for affected roles.
- **Invite / magic links** — any link builder that assumes `/company` or role-specific landings must be updated so first paint matches **`/home`**.

### 4.5 Acceptance criteria

- DB migration runs forward and backward cleanly on a dev branch (verify rollback before merging).
- Every existing test user previously `company_admin` (including Shatabdi if applicable) now has `role = 'leadership'` and `is_org_admin = true` post-migration. Verify by querying `profiles` after backfill.
- **No remaining `company_admin` string in the repo for product/enums (v1.1):** acceptance is **repo-wide**, not `src/` only. At minimum: `src/`, `supabase/` (migrations + seeds), `tests/`, `scripts/`, and `docs/` that embed the old role. CI or pre-merge checklist should run `rg 'company_admin'` (or equivalent) and expect **zero** matches except allowed historical mentions in this brief file if you choose to keep the word for traceability—prefer **zero** everywhere outside `docs/brief-1-role-model-home-setup-shell.md` changelog lines if needed.
- `is_platform_admin = true` users continue to access `/admin/*` routes without interference. `is_org_admin` does not affect platform-admin behavior in any way.
- Logging in as each customer-shell role redirects to `/home` (placeholder acceptable only until PR-B merges; after PR-B, `/home` must render the tile shell).

---

## 5. Phase 2 — Home shell as a role-aware tile surface

### 5.1 Scope

`/home` is the canonical landing for the customer dashboard shell across all six roles. Build it as a tile registry from day one so role variants are composition, not separate pages. **MVP tiles per role ship in this phase. A hollow `/home` is not acceptable.**

### 5.2 Tile registry pattern

- **`src/lib/home/tile-registry.ts`** — exports `HOME_TILES`, a list of tile definitions:
  ```ts
  type HomeTile = {
    id: string;
    component: React.ComponentType;
    visibleTo: (user: { role: UserRole; is_org_admin: boolean }) => boolean;
    priority: number; // lower = earlier in render order
    minHeight?: "sm" | "md" | "lg";
  };
  ```
- **`src/app/(dashboard)/home/page.tsx`** — **Use the existing `(dashboard)` route group** (this repo does not use `(customer)`). Place the page under the same dashboard layout as the rest of the customer shell. Do not invent a new top-level app group.
  - Reads the registry.
  - Filters by `visibleTo(currentUser)`.
  - Sorts by priority.
  - Renders each tile inside a responsive grid.
  - **No inline `if role === ...` conditionals.** All visibility logic lives in the registry.
- **`src/components/home/tiles/`** — each tile is its own component file. Each tile is responsible for its own data fetching, loading state, empty state, and error state.

### 5.3 MVP tiles per role (must ship in this phase)

**Leadership**

1. Hiring health snapshot — open roles, time-to-hire avg, offers out, offers accepted (last 30d).
2. Trust-signal quality — % candidates with verified vouches, consent-record rate.
3. Cost-per-scored-candidate trend — sparkline from `platform_cost_events`, last 30d.
4. Recent activity from key employees referring (top 5 by volume).

**Recruiter**

1. New candidates today — count of WhatsApp inbound + applied today, clicks through to Inbox / Candidates.
2. Pending verdicts — count of candidates awaiting an HM verdict on a job this recruiter owns.
3. Active pipelines summary — top 5 jobs by activity in last 7d.
4. Stale candidates — count of candidates with no movement in 7+ days, clicks through to a filtered list.

**Hiring manager**

1. Roles I own — list with applicant counts and verdict-pending counts per role.
2. Candidates awaiting my verdict — top 10, with name + score + time waiting.
3. Pending JD Base / ICP approvals on my roles.

**Interviewer**

1. Upcoming interviews — next 7 days.
2. Pending interview feedback — interviews completed but feedback not yet submitted.
3. Recently completed interviews — last 5, with status of feedback.

**Finance**

1. Offers pending approval.
2. Billing summary for current period.
3. Cost-per-hire trend — last 6 months.

**Employee**

1. My active referrals — status of each.
2. Open roles I can refer to — top 5 most relevant.
3. Vouches requested of me — requests awaiting my response.

### 5.4 Required behavior for every tile

- Tested empty state. A tile rendered for a user with zero matching data must render "Nothing here yet" or equivalent, not an empty grid or skeleton stuck loading.
- Tested loading state.
- Tested error state.
- Click-through to the relevant operational route (`/company/approvals`, `/recruit/pipeline`, etc. — these will be unified in Brief 2).
- RLS-respecting data fetching. A hiring manager's "Roles I own" tile must not reveal any other HM's data even if a bug bypasses application-layer filters.

### 5.5 Acceptance criteria

- `/home` renders for every customer-shell role with at least the MVP tiles listed in 5.3.
- Switching between test users with different roles produces the correct tile set per the registry.
- Every tile has a tested empty state, loading state, and error state.
- No tile leaks data across users (verified via RLS spot check: log in as HM A, confirm HM B's "Roles I own" data is not accessible even with URL hacking).
- Tile visibility is entirely defined in `tile-registry.ts`. `grep` confirms no `if (role === ...)` inside `home/page.tsx`.
- **Refuse to merge this PR if any role has fewer than three MVP tiles shipped.** A hollow Home will not survive contact with users.

---

## 6. Phase 3 — Setup mode scaffolding

### 6.1 Scope

A separate UI mode reachable only by users with `is_org_admin = true`. Phase 3 in this brief builds the routing, gate, gear icon, and empty shell. **Filling Setup with the seven groups of configuration screens is Brief 3, not this brief.**

### 6.2 Files to update

- **`src/app/(dashboard)/setup/layout.tsx`** — Setup-mode layout under **`(dashboard)`**, same as `/home`. Render with a visually distinct background (use `--color-background-secondary` or equivalent design token) to signal "you are not in the main app". Include a "← Back to dashboard" link that navigates to `/home`.
- **`src/app/(dashboard)/setup/page.tsx`** — Setup landing. Renders four placeholder cards for the Setup areas:
  - Organization
  - Hiring configuration
  - Comms & trust
  - Platform
    Each card links to a stub route (`/setup/organization`, `/setup/hiring-config`, `/setup/comms`, `/setup/platform`) that renders "Coming in Brief 3" placeholder content.
- **Top-bar component** (wherever the existing customer-shell header lives) — add a gear icon. The icon renders **only** when `currentUser.is_org_admin === true`. Click → navigate to `/setup`. The icon should be visually distinct from notifications and avatar (e.g. small dashed border or warning-tone color) so admins can find it on first try.
- **`src/lib/security/dashboard-route-policy.ts`** — every route matching `/setup/**` requires `is_org_admin === true`. Returns 403 otherwise. No role check; the flag alone gates it.

### 6.3 Operational sidebar cleanup (matters in this phase)

After Setup mode exists, perform the cleanup of `sidebar-nav-groups.tsx` that Phase 1 set up:

- Remove the "Hiring setup" group entirely from every role's nav.
- Remove every `/*/settings/*` entry from every role's nav.
- Remove `/company/team`, `/company/billing`, `/company/settings/outbound-webhooks`, `/company/settings/audit` from every role's nav.
- Remove `/notifications` from inside nav groups — it belongs in the top bar (bell icon), not the sidebar.
- Remove `/messages` from inside nav groups — same reason (or fold into Inbox when Brief 3 finalizes the seven-item nav).

These items are still reachable via direct URL until Brief 3 rewrites them into the new Setup IA. The point of Phase 3 here is to clean the operational sidebar so it stops mixing Setup with normal usage.

### 6.4 Acceptance criteria

- Users with `is_org_admin = true` see the gear icon in the top bar. Users without it do not.
- Clicking the gear navigates to `/setup` and renders the four area cards with distinct background.
- Directly navigating to `/setup/**` without `is_org_admin = true` returns 403.
- The operational sidebar after this PR no longer contains Hiring setup, any `*/settings/*` link, `/company/team`, `/company/billing`, `/notifications`, or `/messages`.
- Existing settings URLs still resolve (no 404s) — they are just not in the sidebar anymore. Brief 3 will rewrite them inside Setup mode.

---

## 7. Sequencing

Three PRs against `dev`, in order:

| PR   | Phase                                   | Depends on  |
| ---- | --------------------------------------- | ----------- |
| PR-A | Phase 1 — Role migration                | None        |
| PR-B | Phase 2 — Home tiles                    | PR-A merged |
| PR-C | Phase 3 — Setup shell + sidebar cleanup | PR-B merged |

Do not promote all three to `main` at once. Promote PR-A to `main` after a 24h soak on `dev`. Then PR-B with another 24h soak. Then PR-C. Each promotion is independent so a regression in one doesn't block the others.

## 8. Risks and mitigations

| Risk                                                        | Likelihood / Impact        | Mitigation                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enum rename locks the `profiles` table during migration     | Medium / Medium            | Test forward + backward migration on a **staging clone** first. Run production migration during low-traffic window. Document enum strategy in PR (§4.1.1).                                                                                                                                                          |
| Active testers (Shatabdi, Snigdha) break during role rename | Medium / High              | Before merging PR-A, query the production `profiles` table and verify which roles those test users currently hold. Confirm backfill covers them. Coordinate the merge timing with the ongoing referral consent test so a session isn't midway through Test 2a when the migration runs.                              |
| Home ships thin and users bookmark old routes anyway        | High if unaddressed / High | MVP tile list in §5.3 is the gating bar. Refuse to merge PR-B with fewer than three tiles per role.                                                                                                                                                                                                                 |
| `is_org_admin` confused with `is_platform_admin` in code    | Medium / High              | **PR review checklist:** any module that touches both flags must have a one-line comment `// SAFE: org product vs platform admin` or split responsibilities across files. Optional follow-up: ESLint `no-restricted-imports` / custom rule—avoid brittle "50-line window" greps in CI unless you have proven value. |
| Settings URLs broken when removed from sidebar              | Low / Medium               | Sidebar removal does not delete routes. URLs continue to resolve until Brief 3 reworks them. Verify a sample of `/company/settings/*` URLs return 200 after PR-C.                                                                                                                                                   |
| Tile registry pattern is overkill for current scale         | Low / Low                  | The registry is one file with a list. It is not overengineered. Future tiles add a line to the list. Reject this objection if raised.                                                                                                                                                                               |
| Post-login still lands on old roots                         | Medium / High              | §4.4 redirect/auth audit; explicit tests for OAuth + `next` param.                                                                                                                                                                                                                                                  |

## 9. What this brief explicitly does not do

- Does not unify `/company/jobs` and `/recruit/jobs` and `/company/my-jobs`. That is Brief 2.
- Does not implement the four Setup areas with real content. That is Brief 3.
- Does not change the candidate, agency, or platform-admin shells.
- Does not introduce an "owner" tier. If `is_org_owner` is needed later (delete workspace, transfer ownership), it will be a second orthogonal flag added then. Do not pre-build it now.
- Does not change `super_admin` or `is_platform_admin` behavior.
- Does not implement top-nav vs sidebar layout. The current sidebar stays; items are just removed from it.

## 10. Sign-off

- Santosh — Product
- Cursor — Implementation

_End of Brief 1. Open one PR per phase. Reference this doc in each PR description._

---

## 11. Brief v1.1 — Changelog (for reviewers)

| Item                    | Change                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Route group             | All new pages use **`src/app/(dashboard)/...`**, not `(customer)`.                            |
| `company_admin` removal | Acceptance is **repo-wide** (`src`, `supabase`, `tests`, `scripts`, `docs`), not `src/` only. |
| Postgres                | Added §4.1.1 enum/migration realism and staging requirement.                                  |
| Semantics               | Added §3.1 matrix for **`leadership` vs `is_org_admin`** and cross-role org settings note.    |
| Workflows               | Added §4.2 bullet for **workflow / business strings** beyond RBAC.                            |
| Auth                    | Added §4.4 **redirects and OAuth** continuity.                                                |
| CI                      | Replaced fragile "50-line grep" with **review checklist** + optional ESLint follow-up in §8.  |
