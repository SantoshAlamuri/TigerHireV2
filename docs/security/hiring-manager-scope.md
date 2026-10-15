# Hiring manager access scope

## Rule (plain English)

Users whose primary product role is **hiring_manager** may only access hiring data that is tied to **jobs where they are the assigned `hiring_manager_id`**.

- If a job has **no** hiring manager (`hiring_manager_id` IS NULL), **no** hiring manager may treat that job as theirs for reads or writes.
- **Company admin**, **recruiter**, **agency** (client-linked), **finance** (where applicable), and **super_admin** keep broader access as implemented per table.
- **Candidates** keep access to their own offers via the candidate role and application linkage (not hiring-manager scope).

This matches common ATS defaults (job-based permissions) and least-privilege expectations for SOC 2 / GDPR-style reviews.

## Changelog (implementation passes)

- **Apr 17** — Route policy + API filters on offers, analytics, export. Interviewer scoping on assessments.
- **Apr 17** — RLS tightening across 11 tables. `forbidUnlessHiringManagerOwnsOfferJob` helper. `candidate_notes` job-scoping fix.

## Where it is enforced

### Row Level Security (Postgres)

Migration `20260417210000_hiring_manager_job_scoped_rls.sql` scopes `hiring_manager` (and related reads) on, among others:

- `jobs`, `applications`, `offers`
- `offer_approvals`, `offer_candidate_responses`, `offer_events`
- `workflow_instances`, `workflow_stages` (offer subjects for HM)
- `assessments`, `fit_scores`
- `compensation_bands` (HM removed from org-wide band listing)
- `pipeline_candidates`, `pipeline_stage_transitions` (with an interviewer email match path)

Migration `20260417220000_candidate_notes_hm_job_scope.sql` scopes **candidate_notes** for hiring managers to notes whose `job_id` points at a job they own (authors may still read their own rows).

Apply these migrations to **staging** first, then production after validation.

### Application layer (service role)

`createSupabaseAdmin()` bypasses RLS. Dashboard routes that load offers by id must call
`forbidUnlessHiringManagerOwnsOfferJob` from `src/lib/security/hiring-manager-offer-access.ts`.

That file lists every route that must stay in sync when new admin-backed offer handlers are added.

`POST /api/offers` additionally rejects hiring managers creating offers for applications whose job is not theirs (including unassigned jobs).

## Verification checklist (staging)

1. As a hiring manager, run read queries (or use the dashboard): only **jobs**, **applications**, and **offers** for which you are `hiring_manager_id` should appear.
2. Call an admin-backed offer endpoint for **another** hiring manager’s offer id: expect **403** (or 404 where the handler masks existence).
3. As a **candidate**, confirm you can still load your own offers / signing flows.
4. As an **agency** user on a linked client org, confirm client job applications and pipeline still behave as before.
5. As an **interviewer**, confirm scheduled interviews still list when `pipeline_stages.interviewer_email` matches your profile email.

## Follow-ups (not exhaustive)

Other surfaces may still combine service-role calls with role checks; audit when touching:

- Candidate resumes / storage policies
- Interview feedback tables
- In-app messaging tied to candidates or jobs

Track those in backlog when extending HM scope beyond this pass.

## Related governance artifacts

- Integration and compliance inventory: `docs/security/integration-compliance-inventory.md`
- Backlog sequencing and status: `docs/requirements/GAP-BACKLOG-ordered-new-vs-edit.md`
