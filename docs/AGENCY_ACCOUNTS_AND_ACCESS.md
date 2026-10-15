# Agency accounts and access

## Overview

Agencies in TigerHire are **organisations** with `type = 'agency'`. Like companies, an agency can have **multiple users** (profiles) belonging to the same organisation. Access is controlled by Supabase auth, profiles, and RLS.

## Accounts required

| Concept                | Where                   | Notes                                                                                                                                      |
| ---------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Auth user**          | `auth.users` (Supabase) | One per person; created on register or invite-accept.                                                                                      |
| **Profile**            | `profiles`              | One per auth user: `role`, `organisation_id`, `full_name`, etc.                                                                            |
| **Organisation**       | `organisations`         | One per company or agency. Agencies use `type = 'agency'` and require `approval = 'approved'` (pending after signup until admin approves). |
| **Agency–client link** | `agency_clients`        | Links an agency org to client company orgs whose hiring they manage.                                                                       |

So for “agency with multiple users”:

- **One organisation** (type agency) — the agency account.
- **Multiple auth users** — one per team member.
- **Multiple profiles** — each with `organisation_id` = that agency’s id and roles such as `agency`, `recruiter`, or `company_admin`.

No separate “account” type is required; the same org + profile model used for companies is used for agencies.

## Roles and who can do what

- **Invite members (add users to the org)**
  - **DB/RLS:** `profiles.role IN ('company_admin', 'agency')` can INSERT/UPDATE rows in `invites` for their `organisation_id`.
  - **API:** `POST /api/organisations/members` was previously restricted to `super_admin` and `company_admin`; it is now updated to allow **agency** as well, so agency users can invite additional users (recruiters, admins, or other agency users) to their organisation.

- **List members**
  - **API:** `GET /api/organisations/members` is allowed for `super_admin`, `company_admin`, `recruiter`, **agency**, and `hiring_manager`. So agency users can already see their org’s members.

- **Invite flow**
  - Inviter calls `POST /api/organisations/members` with `email` and `role`.
  - Invitee receives email and accepts via `/join/[token]`, which sets their `profiles.role` and `profiles.organisation_id` to the inviting org.
  - Roles that can be assigned via invite are defined by `ORG_INVITE_ROLES`; **agency** is included so that an agency can invite another user as an agency role.

- **Agency-specific APIs**
  - `GET/POST /api/agency/clients` — list/add client organisations (allowed for role `agency`).
  - Jobs, pipeline, applications, etc. are scoped by `auth_organisation_ids()` in RLS, so agency users see data for their org and linked client orgs.

## Summary

- **Accounts:** One organisation (agency) + one auth user and one profile per team member. No extra account type.
- **Access:** Agency users can list org members, invite new members (after the API change), and manage agency clients; RLS already permitted agency to create invites at the DB level.
- **Multiple users:** Supported by inviting additional users to the same agency organisation and assigning roles (e.g. `recruiter`, `company_admin`, `agency`) via the existing invite flow.
