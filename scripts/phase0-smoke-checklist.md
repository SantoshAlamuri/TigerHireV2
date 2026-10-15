# Phase 0 smoke checklist (plan pilot)

Run on **preview** after merge to `dev` with:

```env
FF_PLAN_DOCUMENT=true
NEXT_PUBLIC_FF_PLAN_DOCUMENT=true
FF_PLAN_AUTO_EXECUTE=true
NEXT_PUBLIC_FF_PLAN_AUTO_EXECUTE=true
```

Redeploy preview with build cache **unchecked** after env changes (required for `NEXT_PUBLIC_*` flags to reach client bundles).

**Setup mode:** org admins use the gear icon → `/setup`. Set the same plan flags on Vercel preview before validating default recruitment plan under `/setup/hiring-config/default-recruitment-plan`.

## 0. Build

- [x] `npm run typecheck` passes
- [x] `npm test -- tests/unit/task-display.test.ts tests/unit/job-plan-pending-route.test.ts` passes
- [ ] Vercel preview build green (after push to `dev`)

## 1. Meta (operator — parallel)

- [x] Submit `th_screening_invite` to Meta — **PENDING** (Meta id `26649909684681462`, DB row in `whatsapp_template_status`)
- [ ] Meta App webhook: subscribe **`message_template_status_update`** → updates DB via `POST /api/webhooks/whatsapp`
- [ ] When Meta sends **APPROVED**: set `WHATSAPP_SCREENING_TEMPLATE_NAME=th_screening_invite` on preview + redeploy

Template body:

> Hi {{1}}, {{2}} would like to ask a few quick screening questions to match you with the right role. Reply YES to start or NO to skip.

Submit again: `npm run whatsapp:submit-plan-templates`

## 2. Plan page (`/recruit/jobs/{jobId}`)

Test job: `861e8c58-9c72-4c46-8534-a02207a35cbc` (QA Engineer)

- [ ] Readiness strip visible (requisition, JD, Ideal Profile, scoring)
- [ ] **Stage automation** chip shows on/off; if on with no moves, shows amber “no events yet”
- [ ] Hiring progress + **Your tasks** banner with count
- [ ] **Scheduling** tab → Create Slots modal shows times + timezone note

## 3. Tasks (`/tasks?jobId=`)

- [ ] Inbox loads; **Decide** tasks open drawer or approval flow
- [ ] No redirect loop back to Plan

## 4. Pipeline move (automation proof)

- [x] Move one candidate to `phone_screen` or `interview` stage (Seed QA Candidate 30 → Recruiter Call, 2026-05-17)
- [x] `plan_history` has system event (automation chip / history)
- [x] DB: `plan_candidate_stage_tracking` row for that candidate/stage

## 5. Offer draft

- [ ] From Plan offer stage → **Draft offer** opens `/recruit/offers/draft?applicationId=…` (not raw candidate profile only)
- [ ] **Offer approvals in Tasks** link opens `/tasks?jobId=…&shape=decide&category=approvals`

## 6. Approval gates (Phase 3)

- [ ] Moving into a stage with `recruiter_and_hm` gate without shortlist approvals returns 409 with Tasks message
- [x] Plan activity shows human moves and shortlist decisions (code on `dev`)

**Phase 0 exit:** sections 0–1 complete + smokes 2–3–5 pass + Meta template **submitted** (approval may still be pending).
