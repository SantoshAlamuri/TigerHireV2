# TigerHire hiring UI, speed and route audit

Date: 13 September 2026  
Scope: role request → approval → job setup/publication → candidate intake → submission review. Recruiter, leadership and platform admin.  
Status: audit only. No application code, configuration, accounts, jobs, approvals, candidate decisions or payments changed.

## Decision and boundaries

The current journey is not straightforward enough for an unfamiliar user. The principal issue is fragmented workflow and inconsistent state, compounded by long pages and avoidable data loading. A visual restyle alone will not address it.

**Recruiters and leadership own hiring. Platform admins do not post jobs.** Platform admin recommendations cover company onboarding, access, support, billing and system health only. The referral-marketplace proposal is outside this audit.

The desired experience is: one place to start, one obvious next action, one reliable status, and a visible result after every action. Users should not have to understand internal route versions, scoring architecture or feature flags.

## Evidence and limitations

- Inspected the live site through the existing authenticated platform-admin browser session. Opened admin overview, recruiter job list, draft and existing job workspaces, setup checklist, candidate intake, candidate list, leadership role-intake form, requisition list, a public apply link and a populated application-review page.
- Visually checked desktop layouts and accessibility trees. No live jobs were created, published or changed; no CV was uploaded and no candidate was advanced, held or rejected.
- The live shell remained the platform-admin shell. Recruiter and leadership navigation/permissions were inspected in source, not separately authenticated as those roles. Their complete role-specific first-run experience still requires a controlled walkthrough.
- Findings marked **Live + code** were observed and traced to implementation. **Code** findings are implementation evidence. **Proposed** items are design recommendations.
- This is not a latency benchmark or database execution-plan audit. Browser automation call duration is not treated as application response time. Speed causes below are supported structural findings and profiling priorities, not claimed production timing measurements.
- Local source and live deployment were compared where possible; exact deployed commit parity was not established.

## Highest-priority journey redesign: request to published job

User clarification: reducing scrolling and confusion across Requisition → JD → ICP → Rubric → Publication is the central usability objective. Core defects remain launch blockers, but this entire journey must be redesigned as a single experience rather than patched with smaller cards and extra links. Audit recommendation only; no implementation authorised by this report.

### One workspace, five short steps

Use one persistent role workspace, a visible five-step progress indicator and a fixed bottom action bar. Keep the role title and actual lifecycle state visible. Each step contains one decision; users should not have to hunt for another page or understand route names. Completed steps remain accessible through Edit, without being expanded into one long page.

| Step shown to users            | Purpose and visible essentials                                                                                                                                                                | Primary action / result                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1. Request the role            | Title, headcount, location/work arrangement, budget and concise justification when required by company policy. Reuse existing details/templates.                                              | Send for approval, or Continue where policy permits. Waiting state identifies approver and next action. |
| 2. Review job description      | Generated/imported draft carried forward from the request. Show concise responsibilities and requirements; full JD opens in a dedicated editor/preview.                                       | Confirm job description                                                                                 |
| 3. Confirm hiring requirements | Human-readable ICP: experience, must-have skills, acceptable backgrounds and genuine non-negotiables. Distinguish suggestions from confirmed facts.                                           | Confirm requirements                                                                                    |
| 4. Review candidate evaluation | Human-readable rubric: criteria and their relative importance, prefilled from confirmed requirements. Advanced weights are optional editing, not mandatory data entry. Show who must approve. | Approve evaluation, or Request approval if the user is not authorised                                   |
| 5. Preview and publish         | Candidate-facing preview, visibility, closing date and a concise checklist of actual publication blockers. Completed approvals stay summarised.                                               | Publish job → visible success with Copy application link and Add candidates                             |

### Make the shortest path the obvious path

- The everyday language is Request, Job description, Hiring requirements, Candidate evaluation, Publish. ICP and Rubric may appear in secondary help for expert users; they should not be concepts a new user must learn to proceed.
- Carry information forward. A role title, experience requirement or skill entered once should not need re-entry at later stages.
- Prefill generated suggestions and let users confirm or edit. Do not silently treat AI suggestions as approved requirements.
- Keep Save draft, Back and the single primary action visible at all times. Show Saved/Saving/Save failed explicitly; preserve text on errors and when returning to a step.
- Do not show future-stage forms below the active step. Offer optional details as labelled disclosures, and use a dedicated editor for genuinely long documents.
- Keep the common path usable within a normal laptop viewport without scrolling to find the primary action. Long JDs may scroll inside their editor; no arbitrary requirement to squeeze them into tiny text.
- Separate Draft generated, Requirements confirmed, Evaluation approved and Job published. A green check means one verified accomplishment, not a guess based on text length.
- When waiting for another person, show who owns the approval, when it was requested and what the user can do meanwhile. Preserve all configured approval requirements.
- When drafting takes time, show durable background progress and allow the user to leave and resume. Do not hold successful approval behind AI generation.
- Validate each step before advancing. Place errors next to the relevant field and provide an error summary; never force the user to discover all errors only at Publish.
- At Publish, link each blocker to the exact step/field. Successful publication must display the real job URL, availability and next action.
- If a later edit changes approved requirements, identify which approvals need renewal and why. Preserve unchanged work and prevent stale approval from silently authorising a changed rubric.
- Resume opens the first incomplete or blocked step. Completed setup stays collapsed once the job is live; the default workspace becomes candidate submissions.
- Use one status model and one implementation for the shared recruiter/leadership flow, with role-specific permissions. Platform admins do not participate in job posting.

### Acceptance test for this journey

A first-time recruiter or leader should be able to complete their authorised part without explanation from the team. At every point they must be able to answer: What am I doing? What is already done? What is required now? What happens when I press this button? If I cannot continue, who or what am I waiting for?

Test at 1366×768 and 1440×900, plus narrow/mobile layouts. The primary action must remain visible; ordinary progression must not require sidebar navigation, searching for an anchor, opening a second setup screen or scrolling past completed forms. Test approval-required and optional-approval policies, slow draft generation, failed saves, browser back/reload, resumed drafts and changed approved requirements. These are proposed acceptance criteria, not tests performed in this audit.

## Findings in priority order

### F01 — The advertised CV upload action ends at a page with no uploader

**Priority: P0 — blocks core intake. Evidence: Live + code.**

Reproduction: Jobs → open job → Add candidates → Upload for this job. The destination is `/recruit/candidates?jobId=…`. It displays a candidate list, filters and an “Uploading and reviewing for this job” message, but no upload control. The existing `CompanyBulkUploadModal` is defined but has no references elsewhere in `src`.

This is more serious than excessive clicks: the promised task cannot be completed through that path.

**Change:** “Add candidates” should open a job-scoped upload dialog or panel immediately. Show job name, accepted formats, files queued, per-file progress and per-file results. The empty candidate list should offer the same action. Keep resume upload, apply-link copying and intake email together without routing through an explanatory page.

Sources: [intake page](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/add/page.tsx>), [candidate list](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/candidates/page.tsx>), [unmounted upload component](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/candidates/components/CompanyBulkUploadModal.tsx>).

### F02 — Readiness, publication and available channels disagree

**Priority: P0 — users cannot tell whether they are live. Evidence: Live + code.**

For the same job, the live list said Draft, the job page said “Job is fully set up for hiring”, and the setup checklist said “5 of 6 in place” with an interview-plan step outstanding. The checklist called the JD “Published and bias-checked” and channels “1 live”. Its apply link opened a generic CV submission page saying there were zero open roles.

Source explains the mismatch: the checklist treats description length over 100 as publication and organisation-slug existence as a live channel. The separate readiness model evaluates JD content and scoring, not the full same checklist. A content-length check does not prove publication or a completed bias review.

**Change:** define independent, explicit states: Draft; Awaiting approval; Ready to publish; Published; Paused/Closed. Separately show readiness for scoring and interviews. All screens must consume the same authoritative state. For a draft, show “Not published — candidates cannot apply to this role” and the exact next action. Do not present a live apply link until its job is actually available.

Sources: [setup calculations](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/setup/page.tsx:61>), [setup labels](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/v2/setup-sequence.ts), [readiness model](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/jobs/job-readiness.ts), [public apply screen](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(public)/apply/[slug]/page.tsx>).

### F03 — Posting is buried inside setup and generic editing

**Priority: P1. Evidence: Code and live absence of a clear publish action on the inspected draft workspace.**

Both `/recruit/jobs/new` and `/company/jobs/new` render a page explaining direct job creation is disabled and send users to hiring requests. The current job list already links its new-job action to requisitions, so these pages are additional dead-end entry points rather than a necessary step on every journey.

The editor includes Draft/Open/Closed in a generic Status dropdown and a Save changes button. The draft workspace emphasizes Add candidates and Score candidates instead of publication.

**Change:** one “Create job” entry starts a guided hiring request where approval is required. Preserve the requisition policy. Present a distinct “Publish job” action with an applicant preview, channel selection and explicit confirmation of what becomes public. Do not require users to interpret “Open” as “Publish”.

Sources: [recruiter creation entry](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/new/page.tsx>), [leadership creation entry](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/company/jobs/new/page.tsx>), [job editor](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/edit/page.tsx:232>).

### F04 — Setup is a directory of other screens, not a continuous flow

**Priority: P1. Evidence: Live + code.**

The checklist has eight items, six labelled required. Completing them involves the JD editor, an anchor in the job dashboard, screening, interview-stage setup, feedback templates and candidate intake. There is also a rediscovery/talent-pool call to action before setup is finished. The daily dashboard embeds the full scoring approval wizard even after approval.

**Change:** one guided setup shell with three stages: Role details; Screening and evaluation; Review and publish. Keep approval waiting states inside that shell. Use organisation defaults and editable previews. Interview scheduling, detailed scorecards and assessments should be requested when needed, unless employer policy explicitly requires them before publication. Distinguish required-to-publish from recommended-for-later.

When approved, collapse scoring configuration to a summary: “Evaluation approved by [person], [date] — Edit”. Do not continually ask users to reconfirm presets while also reporting approval.

Sources: [job workspace](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/page.tsx>), [checklist](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/v2/setup-sequence.ts), [scoring section](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/components/JdBaseSetupStep.tsx>).

### F05 — The role-intake form hides decision-critical details but still scrolls

**Priority: P1. Evidence: Live + code.**

The initial form has seven visible fields, including three text areas. “Add details” reveals thirteen more observed fields. Location, employment type, experience and budget are hidden alongside genuinely optional administration fields. The submit actions sit after the form; they were below the initial desktop viewport.

**Change:** first stage: role title, location/work arrangement, headcount, employment type and budget when required by approval policy. Second stage: paste/import JD or concise responsibilities and must-haves. Move cost centre and internal notes into clearly labelled optional controls. Reuse existing templates. Keep a persistent Save draft / Continue action area and preserve work on navigation.

Do not compress twenty fields into tiny text. Reduce simultaneous decisions and remove repeated prose.

Source: [leadership intake](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/company/hiring-requests/new/page.tsx>).

### F06 — Approval makes the user wait for a second, unrelated operation

**Priority: P1. Evidence: Code.**

After final approval, the page waits for draft generation by polling every 2.5 seconds for up to 45 seconds, with the action still busy. If the draft is not ready, it asks the user to refresh shortly. This mixes successful approval with the separate progress of AI drafting.

**Change:** immediately show “Approved”. Display durable background drafting status and let the user leave safely. When ready, offer “Review draft” in the same request and Tasks. On failure, retry drafting without repeating approval. Show whose approval is pending, with names and ownership, rather than sending users to discover it elsewhere.

Sources: [approval handler](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/hiring-requests/[id]/page.tsx:252>), [polling helper](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/hiring-requests/poll-conversion.ts).

### F07 — Daily work is buried under setup, banners and repeated queues

**Priority: P1. Evidence: Live + code.**

Job pages stack pipeline counts, hiring readiness, automation explanations, Tasks, Action required, a scoring wizard and setup links. “All clear” in Tasks can coexist with applications to review in another queue. Generic links for offers and feedback appear under Action required even without a demonstrated outstanding count.

**Change:** a compact job header with status and primary action; four stable tabs: Candidates, Setup, Interviews, Activity. Default a draft to Setup and a published job to Candidates. Show one actionable alert containing the blocker, owner and next action. Routine navigation belongs in tabs; only real outstanding work belongs in an action queue.

Sources: [job dashboard](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/page.tsx>), [action rows](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/ActionRows.tsx>), [tasks banner](/Users/santoshalamuri/TigerHire/TigerHire/src/components/recruit/plan/PlanTasksBanner.tsx).

### F08 — Candidate review requires scrolling past evidence to act

**Priority: P1. Evidence: Live + code.**

The live review page shows a comparison panel, candidate queue, candidate header, three scores, a decision summary and three evidence columns. Advance/Hold/Reject are below these sections and were outside the initial desktop viewport. The full profile is another route, and the link does not carry the current job query context.

**Change:** keep the candidate list and selected profile in one workspace. Display name, current application stage, concise role-specific evidence and persistent decision buttons. Make Compare an explicit optional action. Show resume, screening answers and history in tabs or a drawer. Preserve job/application, filters, selection and scroll position when opening details. Name the outcome of Advance, for example “Shortlist”, based on the actual transition.

Existing keyboard actions, undo and rejection reasons are useful and should remain, but they should supplement visible buttons.

Source: [review screen](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/review/page.tsx:230>).

### F09 — Internal scoring placeholders and labels leak into the interface

**Priority: P1. Evidence: Live + code.**

The inspected review screen displayed `NO_DEFENSIBLE_QUOTE` as “Best evidence” and inside the positive-evidence column. Job setup displayed internal field names and a feature-flag instruction including `FF_PLAN_AUTO_EXECUTE`. This requires users to interpret implementation details and can make absent evidence appear supportive.

**Change:** render missing verified evidence as “No verified resume evidence available”; exclude sentinel strings from evidence and its counts. Use human-readable criterion names. Put technical diagnostics in platform support tools. Customer-facing automation state should explain behavior and the responsible person, not an environment variable. Do not make any candidate decision automatically as part of this display change.

Sources: [review evidence adapter](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/review/useEvidencePack.ts>), [review summary](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/review/page.tsx>), [automation banner](/Users/santoshalamuri/TigerHire/TigerHire/src/components/recruit/plan/PlanAutomationStatus.tsx).

### F10 — Candidate lists can imply that existing candidates do not exist

**Priority: P1. Evidence: Code.**

The candidate list fetches the first 100 applications without sending the selected job to the server, then filters by job in the browser. A job whose applications are outside those 100 can display an empty list. Groups start collapsed even in a job-focused view. The table uses nine columns, many with fixed widths, inside a container with overflow hidden.

**Change:** server-side job filtering, search and pagination with authoritative totals. Auto-open the selected job or omit the redundant grouping in a job workspace. Show the few decision fields initially and put secondary information in details. Define responsive behavior rather than clipping a wide grid. The screened dashboard count also needs server aggregation rather than counting only up to 200 returned applications.

Sources: [candidate list](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/candidates/page.tsx:43>), [dashboard counters](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/page.tsx:32>).

### F11 — Platform admin is a long report rather than an operations queue

**Priority: P1/P2. Evidence: Live + code.**

The admin homepage repeats attention counts in detailed panels below. Empty onboarding panels take substantial space. Support items can be many weeks old but are still presented as immediate handovers. A flow lookup asks for job and candidate IDs. Technical usage text exposes an API path. Two separate active/open job counters showed different numbers without explaining their scopes.

**Change:** compact top-level counts, then one sortable “Needs action” list with company, issue, owner, age and next action. Use tabs for Onboarding, Support, Billing and System health. Search by company/job/candidate names in support tools. Show source, scope and freshness for counts. Move historical diagnostics below an explicit drill-down and avoid presenting stale/expired items as fresh incidents without a reason.

Company setup should live in a single organisation detail workspace with setup completion, people, billing and support history. **No platform-admin job creation or routine hiring decision controls are proposed.**

Sources: [admin home](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/admin/page.tsx>), [admin data hook](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/admin/_home/useAdminHome.tsx>), [flow lookup](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/admin/_home/FlowLookupSection.tsx>).

### F12 — Visual density is inconsistent, and overlays compete with actions

**Priority: P2. Evidence: Live + code.**

Screens combine large card padding and repeated explanatory paragraphs with small, faint metadata and abbreviated labels. Long pages result without improving readability. The install prompt repeatedly occupies the lower-right action area during the walkthrough. Some long forms already have fixed save controls, so a universal claim that all actions are missing would be incorrect.

**Change:** common spacing and readable body-text tokens; persistent action areas; short helper text; progressive disclosure for optional detail. Suppress install promotion during setup and candidate review. Avoid horizontal scrolling for primary actions. Preserve necessary document scrolling, but do not make users scroll to discover what to do next.

## Recommended role experiences

| Role           | Landing experience                                                | Main navigation                                                                     | First useful action                                          |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Recruiter      | Jobs with drafts to finish and candidates awaiting review         | Jobs, Candidates, Tasks, Calendar; Reports and Settings secondary                   | Resume setup or review next candidate                        |
| Leadership     | Decisions and hiring progress, with owner and age of each blocker | Overview, Approvals/Tasks, Jobs, Reports; Team and Settings secondary               | Review request or resolve a hiring blocker                   |
| Platform admin | Company operational exceptions                                    | Overview, Organisations, Support, Billing, System health; Access/Settings secondary | Resolve company onboarding, access, billing or service issue |

The code currently assigns recruiter and leadership the same primary-navigation lists (seven entries in plan-document mode, nine otherwise). They can share the underlying job workspace while having different landing priorities and permissions. Do not maintain an entire duplicate interface just because the role differs.

Source: [primary navigation](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/navigation/primary-nav-by-role.ts).

## Proposed end-to-end hiring flow

1. **Create job/request:** compact essentials, paste or reuse JD, explicit draft save.
2. **Approval, when required:** reviewer sees one decision summary with budget, headcount, role and justification; approval status and draft generation are separate.
3. **Review setup:** generated details and screening defaults are editable in place; show what is mandatory now and what can wait.
4. **Preview and publish:** one explicit action. Confirmation shows published role, application preview, Copy link and Add candidates.
5. **Receive submissions:** uploaded/shared applications appear in the same job workspace with received, parsing, awaiting candidate response, ready for review or failed status.
6. **Review:** list plus detail, persistent decisions, resume/evidence on demand. Preserve application context and avoid returning to a global list to finish a job-specific task.

Candidate-facing role links must identify the selected job or clearly state that it is unavailable. Do not silently turn a role application into a generic “match me to zero jobs” journey. Retain the existing no-account-required CV submission and honest processing/saved outcomes, but make next steps and optional contact/WhatsApp consent clear.

## Speed audit: supported findings and changes to evaluate

| Finding                                                                   | Evidence                                                                                                                                                 | Recommendation                                                                                                                |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Job dashboard loads counts through multiple detailed application requests | Four `useCount` queries plus one request of up to 200 applications for screened count                                                                    | One authorised job-summary response with server aggregates; defer history/setup detail                                        |
| Count requests use a broad application projection                         | Recruiter repository selects application fields, job/org, candidate, scores/evidence and screening answers                                               | Purpose-built summary projection; do not fetch evidence to render counts                                                      |
| Admin homepage loads eight data sources                                   | Includes access, analytics, onboarding, billing, WhatsApp sessions, agents, scoring observability and usage; onboarding/billing wait for access response | Lightweight overview response; load detailed tabs on demand while keeping authorisation server-enforced                       |
| Billing overview does substantial historical work                         | Sequential organisation/subscription/profile/wallet/client reads; reads cost events across up to 24 months and aggregates in application code            | Split commercial summary from historical costs; parallelise independent queries; aggregate/paginate history at the data layer |
| Candidate screen fetches unrelated applications                           | Fetch 100 then filter selected job in browser                                                                                                            | Push job/search/filter/pagination into query and return correct totals                                                        |
| Review initial display waits for applications and scores                  | `applicationsLoading                                                                                                                                     |                                                                                                                               | scoresLoading`; scores fetched separately | Render queue progressively; fetch detail for selected candidates; retain explicit loading/missing-score states |
| Client-side redirects add blank/loading transitions                       | Effect-based redirects for company job detail and legacy screens                                                                                         | Consolidate links to final route; use server redirects where equivalent and preserve queries/anchors                          |
| Approval includes up to 45 seconds of drafting polling                    | Poll-conversion helper                                                                                                                                   | Persist background progress; release the approval action immediately                                                          |
| Client rendering begins data requests after mount                         | `useApiQuery` effect path                                                                                                                                | Evaluate server-loading initial critical data; retain cached data on back navigation and refresh silently                     |

Caching and in-flight deduplication already exist in `useApiQuery`; the problem is not simply “there is no cache”. Different query keys and unnecessary endpoints still incur work. Increasing cache lifetime without correct invalidation would make readiness and counts less trustworthy.

Sources: [query cache](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/hooks/use-api.ts), [application repository](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/repositories/ApplicationRepository.ts), [admin billing](/Users/santoshalamuri/TigerHire/TigerHire/src/app/api/admin/billing/route.ts:204), [review loading](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/jobs/[id]/review/useReviewData.ts>).

**Required measurements before declaring speed fixed:** production-like cold/warm navigation, first useful content and time-to-actionable for Jobs, job detail, intake, candidate review and admin overview; p50/p95 API durations, query time, payload sizes, request counts, and interaction responsiveness. Separate server, network, hydration and AI/background-processing time. Test realistic datasets, not only empty/demo accounts.

**Suggested acceptance targets, not current measurements:** acknowledge interactions within 100 ms; warm navigation usable within 1 second; cold main workspaces usable within 2 seconds at p75 on the agreed test device/network. AI drafting/parsing need separate progress and completion targets. No universal promise is made before baselines exist.

## Duplicate routes and proposed canonical destinations

A URL alias, a role-scoped view and a competing implementation are different things. Retire duplicate implementations and stop linking to old URLs; keep lightweight redirects where old bookmarks, emails or integrations need them. Do not delete all `/v2` pages: some contain unique functionality that needs moving first.

| Current routes                                                                                                                    | Classification found in source                                                              | Proposed disposition                                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/recruit/jobs`, `/company/jobs`                                                                                                  | Separate job list implementations; navigation already prefers recruiter list for leadership | Canonical shared `/recruit/jobs` for recruiter/leadership. Redirect old company list after filters/access parity                                                           |
| `/company/jobs/[id]`, `/recruit/jobs/[id]`                                                                                        | Company legacy detail plus flag-dependent client redirect                                   | Canonical shared `/recruit/jobs/[id]`; preserve supported anchors and role access                                                                                          |
| `/company/jobs/[id]/edit`, `/recruit/jobs/[id]/edit`                                                                              | Separate editors                                                                            | One editor, role-aware controls. Old route redirects after field parity                                                                                                    |
| `/company/jobs/new`, `/recruit/jobs/new`                                                                                          | Duplicate informational dead ends                                                           | One real create flow; old entries go directly into it                                                                                                                      |
| `/company/hiring-requests`, `/recruit/hiring-requests`                                                                            | Separate lists for related queues                                                           | One canonical requisition list with role filters, proposed `/recruit/hiring-requests`; preserve approved organisational routing                                            |
| `/company/hiring-requests/[id]`, `/recruit/hiring-requests/[id]`                                                                  | Company route wraps recruiter detail component                                              | One canonical detail URL; retain alias redirect                                                                                                                            |
| `/company/hiring-requests/new`                                                                                                    | Unique intake form, not a duplicate                                                         | Reuse/move into canonical create flow; do not remove its capability                                                                                                        |
| `/recruit/candidates/[id]`, `/recruit/v2/candidates/[id]`                                                                         | Separate profile implementations, both linked by active screens                             | Canonical `/recruit/candidates/[id]` with application/job context; merge useful features first                                                                             |
| `/recruit/applications`, `/recruit/jobs/[id]/applications`, `/recruit/v2/jobs/[id]/review`, `/recruit/v2/jobs/[id]/stage/[stage]` | Global list, scoped wrapper, review queue and stage views; overlapping work, not identical  | One candidate workspace per job. Use `/recruit/jobs/[id]/applications` with view/stage parameters; global inbox remains as a distinct cross-job view                       |
| `/recruit/jobs/[id]/candidates`, `/recruit/jobs/[id]/matches`, `/recruit/pipeline?jobId=…`                                        | Candidates route conditionally redirects to pipeline or renders matches                     | Remove competing daily entry points. Fold matching/scoring into job candidates; pipeline may remain a purposeful alternate view                                            |
| `/recruit/v2/jobs/[id]/setup` plus scattered setup pages                                                                          | Checklist contains unique logic and links to legacy editors                                 | Canonical `/recruit/jobs/[id]/setup` with real in-place steps; migrate required editor capabilities before retiring screens                                                |
| `/recruit/v2/jobs/[id]/add`                                                                                                       | Unique intake landing page, currently broken upload handoff                                 | Replace with an immediate scoped upload/share panel; old URL can reopen the panel                                                                                          |
| `/recruit/jobs/[id]/interviews`, `/recruit/v2/jobs/[id]/interviews`                                                               | Scheduling controls versus summary                                                          | Combine as one job Interviews screen; retain `/calendar` for cross-job scheduling                                                                                          |
| `/recruit/jobs/[id]/feedback`, `/recruit/v2/jobs/[id]/feedback`                                                                   | Separate feedback surfaces                                                                  | One canonical feedback view or Interviews tab, preserving reviewer functions                                                                                               |
| `/recruit/offers`, `/company/offers`                                                                                              | Recruit route wraps company page; plan mode may redirect elsewhere                          | One offer workspace with job filters. Do not confuse org-wide oversight with individual offer creation                                                                     |
| `/company/assessments`, `/recruit/assessments`                                                                                    | Company wrapper mounts assessment screen and redirect component                             | One assessment workspace; avoid mounting the old screen while redirecting. Mapping all assessments to Calendar must preserve actual assessment work                        |
| `/company/interview-prep`, `/recruit/interview-prep`                                                                              | Shared component through wrappers                                                           | One canonical prep screen with role context                                                                                                                                |
| `/recruit/my-availability`, `/company/my-availability`                                                                            | Already a server redirect                                                                   | Keep lightweight compatibility redirect; not an outstanding duplicate UI                                                                                                   |
| `/company/settings/*`, `/recruit/settings/*`, `/recruit/v2/setup/*`                                                               | Shared panels, separate wrappers and some separate builders                                 | One company hiring-settings workspace. Compare approval-builder semantics before merging; platform integrations remain separate                                            |
| `/recruit/analytics`, `/recruit/analytics/legacy`                                                                                 | Separate analytics implementations                                                          | Canonical analytics; archive legacy implementation only after required metrics/export parity                                                                               |
| `/admin/companies`, `/admin/organisations`, `/admin/onboard-company`, `/admin/onboarding-requests`                                | Read-only directory, editable organisations, direct onboarding form, request workflow       | Consolidate directory/detail under Organisations. Keep onboarding queue and direct creation as two entry actions into the same organisation lifecycle, not blind redirects |
| `/home`, `/recruit`, `/company`, `/admin`                                                                                         | Role landings with different responsibilities                                               | Keep role-aware landing behavior; not all are duplicates. Simplify navigation and content instead of indiscriminate deletion                                               |

Relevant route sources: [navigation registry](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/navigation/registry.ts), [role route helpers](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/navigation/job-workspace-paths.ts), [legacy redirect map](/Users/santoshalamuri/TigerHire/TigerHire/src/lib/navigation/plan-document-nav-filter.ts), [company detail redirect](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/company/jobs/[id]/CompanyJobPlanRedirect.tsx>), [legacy redirect component](/Users/santoshalamuri/TigerHire/TigerHire/src/components/navigation/PlanDocumentLegacyRedirect.tsx), [existing availability redirect](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/my-availability/page.tsx>).

The old extra `/recruit/v2` navigation rail has already been removed. Do not report it as still present. The remaining issue is mixed page implementations and changing job-local navigation: the root job page skips the shell, while deeper legacy pages still use the subnavigation.

Sources: [v2 layout](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/v2/layout.tsx>), [job layout](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/RecruitJobWorkspaceLayout.tsx>), [job subnavigation](</Users/santoshalamuri/TigerHire/TigerHire/src/app/(dashboard)/recruit/jobs/[id]/components/RecruitJobSubNav.tsx>).

## Proposed delivery order — no implementation performed

1. **Restore core task completion and truthful status:** upload action, draft/live state, role-link behavior, counts and missing-evidence rendering.
2. **Unify navigation and job context:** canonical job/candidate surfaces, remove competing nav entries, preserve old-link redirects and role permissions.
3. **Streamline hiring setup and decisions:** compact steps, persistent actions, approval/background drafting separation, published-job candidate workspace.
4. **Reduce measured loading costs:** lightweight summaries, server filtering, deferred admin diagnostics/history, progressive review loading; compare before/after measurements.
5. **Refine role-specific landing screens and visual consistency:** leadership decision queue, recruiter work queue, platform operations queue, typography/spacing/overlay behavior.

## Acceptance checks for a future implementation

- An unfamiliar recruiter can find Create job, complete the authorised request flow, review the generated job, publish and reach a usable application link without coaching.
- An approval-required role remains gated by the real approval policy; simplifying UI must not bypass it.
- Add candidates opens a real uploader with the current job preselected. Successful receipt is visible even while parsing/scoring continues.
- Draft/closed role links clearly state availability and never imply a live role application when none exists.
- Every job screen agrees on publication, evaluation approval and next required step.
- Save/Continue and candidate-decision controls remain visible on common laptop viewports; full documents may scroll.
- A reviewer can inspect a resume, decide and move to the next application without losing job context.
- Candidate totals remain correct beyond 100/200 applications; no false empty state from client-side truncation.
- Recruiter, leadership and platform admin are tested with their actual roles. Platform admins have no routine post-job requirement.
- Old URLs preserve job, candidate, application, filter and relevant anchor context when redirected; no redirect chains, inaccessible destinations or unwanted full-page flashes.
- No user-facing feature flags, API paths, raw IDs as the primary lookup requirement, or sentinel evidence strings.
- Speed meets the agreed measured targets on representative data, with explicit background progress for longer operations.

**Audit outcome:** prioritize completion, truthful state and consolidation before cosmetic redesign. The current UI has working pieces worth keeping, but the seams between them are visible to users and are the main source of confusion and wasted time.

## Visual design follow-up

See the [color, typography, contrast and component audit](/Users/santoshalamuri/TigerHire/TigerHire/docs/audits/2026-09-13-visual-design-audit.md) for measured representative contrast ratios, design-system adoption findings, a proposed light/dark palette and screen-specific styling recommendations. Audit only; no application styling changed.
