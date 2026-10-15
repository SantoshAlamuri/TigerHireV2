# TigerHire — User guide by role

**Purpose:** Tell each **user type** what to do in the product: typical tasks, where to go, and the order of operations. This is **not** a legal or sales document; it tracks **current in-repo behavior** as of the last review date below.

**Audience:** Onboarding, support, QA, and PMs writing in-app help.

**Last reviewed:** 2026-04-24

**See also:** [Feature inventory (engineering)](../requirements/FEATURE-INVENTORY-LIVING.md) — what ships in code vs PRD. Topic help: [interview scheduling](./interview-scheduling-flow.md), [pipeline stages](./managing-pipeline-stages.md), [withdrawals](./withdrawing-applications.md).

---

## 1. How sign-in and roles work

- After login, you land on a **home route** for your **role** (for example, recruiters on `/recruit`, company admins on `/company`, candidates on `/candidate`). If that ever feels wrong, confirm your org assigned the intended role.
- **SSO users** without a role yet see **Approval pending** (`/awaiting-approval`) until a company admin assigns a role. Then sign in again from the login page.
- **Permissions** for sensitive org settings (team, billing, some integrations) are role- and policy-based; if an action is missing, ask a **Company admin** or use **Permissions** under company settings (admins) to adjust what roles may do.
- **Company admins** and **recruiters** both use areas under `/recruit` (for example **Pipeline** and **Applications**). That is **expected** so admins can operate the same hiring workflow without a separate product surface.

> **URL bar: why `/recruit` for a company admin?**  
> The browser may show `https://…/recruit/pipeline` or `…/recruit/applications` when you use **Pipeline** or **Applications** from the company area. This is the **same** hiring product surface recruiters use, not a different company. It saves duplicating the whole pipeline under `/company/…`. _Support answer:_ “That screen is the shared recruit workspace your org’s admins are allowed to use to run hiring.”

---

## 2. Super admin (platform)

**Who:** TigerHire operators (not tenant customers).

| Goal                          | What to do                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| **See platform health**       | Open **Overview** (`/admin`).                                                      |
| **Manage orgs and users**     | **Organisations**, **Users** — create fixes, look up tenants, support escalations. |
| **Run or inspect agent jobs** | **Agent Runs** — debugging AI/automation pipelines.                                |
| **WhatsApp operations**       | **WhatsApp sessions** when your deployment uses the WhatsApp integration.          |
| **Referral support tools**    | **Referral Tools** — support campaigns and exports as implemented.                 |
| **Feature rollouts**          | **Feature Flags** — gate experiments or risky changes.                             |
| **Scraping / data tools**     | **Scraping** — treat as **operator-only**; may be experimental.                    |
| **Billing and costs**         | **Billing**, **Platform Costs**, **Plan Limits** — align limits with contracts.    |
| **Platform settings**         | **Settings**, **Integrations**, **SCIM** — directory sync and system config.       |

**Notifications** (`/notifications`) and **Profile** (`/profile`) are shared with other roles when applicable.

---

## 3. Company admin (organisation owner / HRIT)

**Who:** Full access to the employer organisation in TigerHire.

> **Mental model:** “Company” is your **org home and admin**; **recruit** routes in the address bar (see §1) are the **operational** ATS. Both are first-class; you are not in the wrong place.

| Goal                                   | What to do                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **See company-wide hiring**            | **Overview** (`/company`).                                                                                                                                                                          |
| **Open or track headcount**            | **Hiring requests** — create or follow requisitions.                                                                                                                                                |
| **Approval queues**                    | **Approvals** — requisitions, pipeline steps, or other approval types your org uses.                                                                                                                |
| **Offers end-to-end**                  | **Offers** — drafts, approvers, and sent offers per your workflows.                                                                                                                                 |
| **Cross-team pipeline and applicants** | **Pipeline**, **Applications** (under **Hiring**; routes live under `/recruit/...` by design).                                                                                                      |
| **Sourcing and candidate records**     | **Candidates** — search, open profiles, notes, resumes, unlocks where your plan allows.                                                                                                             |
| **Interviews and tests**               | **Interviews**, **Assessments**, **Interview prep** as your process requires.                                                                                                                       |
| **Published jobs**                     | **Jobs** — list and edit; **Create via requisition** ties new headcount to approvals.                                                                                                               |
| **Referral program**                   | **Referral Tools** at company level.                                                                                                                                                                |
| **Org defaults**                       | **Hiring Setup** in the nav: **Pipeline defaults**, **Offer letters**, **Offer letter flow** (e.g. compensation bands), **Offer approval workflow** — configure before teams scale hiring.          |
| **People and money**                   | **Team**, **Billing** — seats, plan, and invites.                                                                                                                                                   |
| **Integrations and automation**        | **Integrations** (connectors), **Outbound webhooks** (HTTP notifications to your systems), **Job Boards** (distribution credentials where configured), **Permissions**, **Privacy**, **Audit log**. |
| **Company settings hub**               | **Company Settings** (`/company/settings`) for remaining org options.                                                                                                                               |

---

## 4. Recruiter

**Who:** Day-to-day hiring operator for the organisation (often the heaviest product user).

| Goal                                   | What to do                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Prioritize work**                    | **Overview** (`/recruit`) — dashboards and intelligence nudges when enabled.                                                                                                                              |
| **Move candidates**                    | **Candidate pipeline** — stage changes, bulk actions, SLA hints where available.                                                                                                                          |
| **Manage offers in flight**            | **Offers** — draft, submit for approval, track signing.                                                                                                                                                   |
| **Approvals**                          | **Approvals** (shared company surface) for items in your queue.                                                                                                                                           |
| **Headcount and jobs**                 | **Hiring requests**; **Jobs** (create or link via requisition from the Jobs menu).                                                                                                                        |
| **Sourcing and applications**          | **Jobs**, **Candidates**, **Applications** — triage, FitScore, notes, and screening.                                                                                                                      |
| **Pre-screening / knockout questions** | For each **job** — use job settings / screening panel (per-job yes/no questions). Candidates answer on the public apply flow; answers appear on the application and candidate views for authorized users. |
| **Interviews and assessments**         | **Assessments**, **Interview prep** — send or review as your process defines.                                                                                                                             |
| **Insights**                           | **Analytics**, **Saved Searches** — funnels, exports, and saved candidate/job queries.                                                                                                                    |
| **Connect email and tools**            | **Settings Overview**, **Integrations** (recruiter).                                                                                                                                                      |
| **Comms**                              | **Messages** (`/messages`) with candidates and internal where enabled.                                                                                                                                    |

---

## 5. Hiring manager

**Who:** Approves and interviews for _their_ reqs; not the full org admin in most tenants.

| Goal                           | What to do                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Your openings**              | **Overview** (`/company/my-jobs`) and **My pipeline** — scoped to your role’s jobs.                              |
| **Headcount**                  | **Hiring requests** for roles you own or co-own.                                                                 |
| **Approvals**                  | **Approvals** — requisition or offer steps that require you.                                                     |
| **Assessments and interviews** | **Assessments**, **Interview prep** — as assigned.                                                               |
| **Job-level detail**           | **Company jobs** routes (for example edit/review) where policy allows.                                           |
| **Offers**                     | **Offers** and **Offer drafts** in the sidebar — review, approval, and signing flows scoped to your permissions. |

**What hiring managers do _not_ have by default (ask a recruiter or company admin):**

- Org-wide **recruit analytics** and some **saved search / insight** surfaces that live only in the full recruiter or admin nav.
- **Hiring setup** and many **org settings** (webhooks, permissions, some integrations) unless your org also grants a broader role or uses **shared** admin accounts per policy.
- If something you need is not in the left nav, your contact is usually **the recruiter** on the req or a **company admin** — not a product defect.

---

## 6. Interviewer

**Who:** Runs scheduled interviews; minimal CRM access.

| Goal                           | What to do                                                                  |
| ------------------------------ | --------------------------------------------------------------------------- |
| **Upcoming and past sessions** | **Interviews** (`/company/interviews`).                                     |
| **Preparation**                | **Interview prep** — prompts and materials the org attached to the process. |

**Stage moves in the pipeline:** The interviewer role does **not** include **pipeline** or **offers** in the nav. Moving candidates between stages, withdrawing, or creating offers is done by **recruiters** and **company admins** (and sometimes **hiring managers** for approvals). If your process needs interviewers to change stages, align with your org’s process owner — that is a **workflow and permissions** question, not something this role exposes in-product today.

---

## 7. Finance

**Who:** Approves compensation or offer economics.

| Goal                         | What to do                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Offer and comp decisions** | **Finance Inbox** (`/company/finance`) — work items routed to finance per your org’s offer workflow. |

> **Product note:** This role is intentionally narrow. Anything outside finance approval still belongs to company admin / recruiter / hiring manager per policy.

---

## 8. Agency / RPO

**Who:** External recruiting partner with tenant-scoped or client-scoped access (as configured).

| Goal                      | What to do                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------- |
| **See the desk**          | **Overview** (`/agency`).                                                           |
| **Clients**               | **Clients** — which organisations you support.                                      |
| **Requisitions and reqs** | **Jobs** (including **Create new**).                                                |
| **Candidate movement**    | **Pipeline** — bulk and stage operations where API and UI support agency workflows. |
| **Agency team**           | **Team** for your agency org.                                                       |

---

## 9. Employee (internal referrers)

**Who:** Staff participating in the employee referral program (not a full recruiter).

| Goal                    | What to do                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| **Home**                | **Dashboard** (`/employee`).                                                             |
| **Referrals**           | **Refer & Earn** — links to the referrer hub (`/dashboard/referrer`) for campaign flows. |
| **Leaving the company** | **Resign** if your org enabled the resignation / offboarding handoff flow.               |

---

## 10. Candidates (Pro and Free)

**Who:** Logged-in job seekers using TigerHire as applicants.

| Goal                           | What to do                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **See matches and next steps** | **Match Feed** (`/candidate`).                                                                                                                     |
| **Track status**               | **Applications** — filters, **withdraw** only while still in a withdrawable state (see [withdrawing applications](./withdrawing-applications.md)). |
| **Find roles**                 | **Browse Jobs**.                                                                                                                                   |
| **Assessments**                | **Assessments** — completed and pending, when assigned.                                                                                            |
| **Refer & Earn**               | **Refer & Earn** to `/dashboard/referrer` when the program is available.                                                                           |
| **Account**                    | **Profile** (CV, details), **Preferences** (alerts, visibility).                                                                                   |
| **Fit and scores**             | **Fit scores** in the sidebar, or go to `/candidate/scores` (detailed fit breakdown) when the API returns scores for your account.                 |

> **Pro vs Free:** The navigation structure is the same in code; **entitlements** (e.g. advanced features) may still differ by plan—confirm with your org or billing if something is disabled.

**External candidate flows (often without a full dashboard session):**

- **Apply** to a public job: `/apply/[slug]`. Answer **screening (knockout) questions** if the job has them; wrong answers may disqualify the application per job rules. You may be declined **without** being told which specific answers failed — that is a deliberate product and privacy default unless your organisation ships a different policy; see [§13](#13-logical-gaps-and-product-caveats-from-app-vs-docs-review) item 4.
- **Self-schedule** an interview: use the **schedule** link in email (`/schedule/[token]`). Keep the token private.
- **View or sign an offer** use the offer link in email (`/offers/[token]`) and complete OTP and signing steps.
- **Take a shared assessment** with a link: `/assessments/[token]`.

---

## 11. Referrers (all roles) — `dashboard/referrer`

| Goal                                      | What to do                                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Join or manage referral participation** | `/dashboard/referrer` and public join pages (`/refer/...` flows) as your deployment exposes them. |

**Employees** and **candidates** both have nav entries; other roles can still use the same hub when the feature is enabled for their account.

---

## 12. Public (no account)

| Goal                          | What to do                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Browse marketing and jobs** | Public home, **Jobs** listing, individual job pages.                                                                                                                                                                               |
| **Apply**                     | Application form per employer link or slug. If the job uses **knockout screening**, you may not be shown which questions caused disqualification (see [§13](#13-logical-gaps-and-product-caveats-from-app-vs-docs-review) item 4). |
| **Sign in**                   | **Login** / **Register** / **Forgot password** or SSO per org.                                                                                                                                                                     |
| **Trust and legal**           | **Privacy**, **Terms**, **DPA** as linked from the site.                                                                                                                                                                           |

---

## 13. Logical gaps and product caveats (from app vs docs review)

Use this section in backlog grooming; not every item is a bug—some are **intentional** or **config-dependent**.

| #   | Area                              | Status / caveat                                                                                                                                                                                                                                                                                                  |
| --- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hiring manager → Offers**       | **Addressed in product:** **Offers** and **Offer drafts** are in the hiring manager sidebar.                                                                                                                                                                                                                     |
| 2   | **Candidate → Scores**            | **Addressed in product:** **Fit scores** links to `/candidate/scores` in the candidate sidebar.                                                                                                                                                                                                                  |
| 3   | **Company admin and `/recruit`**  | **Ongoing (enablement):** Explained in §1 and §3; not a URL bug. Revisit if you add `/company/…` **alias routes** to hide `recruit` in the address bar.                                                                                                                                                          |
| 4   | **Knockout screening (API)**      | **Ongoing (policy):** **Default (current):** applicants are **not** told which specific knockout answers failed. **Change path:** product + legal + API/apply UX. Documented in §10 and §12.                                                                                                                     |
| 5   | **Job alerts vs digest**          | **Ongoing (alignment):** Shipped: cron **job-alerts**; PRD “profile digest” (F6-style) is **separate** — see [feature inventory](../requirements/FEATURE-INVENTORY-LIVING.md#20-saved-searches--job-alerts) and [GTM: job alerts vs digest](../gtm/ESIGN-AND-INBOX-POSITIONING.md#job-alerts-vs-profile-digest). |
| 6   | **Integrations (partial)**        | **Ongoing (ops):** Use the **[integration preflight checklist](../integrations/PREFLIGHT.md)** before go-live.                                                                                                                                                                                                   |
| 7   | **E-sign**                        | **Ongoing (GTM):** Native signing is the shipped path; third party is a separate deal — [GTM: native vs third party](../gtm/ESIGN-AND-INBOX-POSITIONING.md#native-offer-signing-vs-third-party-e-sign).                                                                                                          |
| 8   | **Inbox**                         | **Ongoing (roadmap):** **No** unified “email parser for all channels” as a single product module. See [GTM: unified inbox](../gtm/ESIGN-AND-INBOX-POSITIONING.md#unified-application-inbox-email-parser).                                                                                                        |
| 9   | **Unlimited seats / plan limits** | **Ongoing (GTM + eng):** [Billing and seats truth table](../ops/BILLING-SEATS-TRUTH-TABLE.md) — **marketing** copy (e.g. on `company/billing`) must match **enforced** limits; enterprise “unlimited” is a **contract** topic.                                                                                   |
| 10  | **Hiring manager depth**          | **Ongoing (by design):** Intentionally narrower than recruiter — see §5 bullets.                                                                                                                                                                                                                                 |
| 11  | **Interviewer**                   | **Ongoing (by design):** No pipeline in nav; stage moves are recruiter/admin — see §6. New capability = **feature epic** (RBAC, audit).                                                                                                                                                                          |
| 12  | **Agency**                        | **Ongoing (QA):** [Agency bulk / rescore / backfill QA](../launch/AGENCY-BULK-RESCORE-BACKFILL-QA.md) for heavy paths.                                                                                                                                                                                           |
| 13  | **admin/scrape**                  | **Addressed in product (warning):** Page shows an **internal / experimental** banner. Still operator-only.                                                                                                                                                                                                       |
| 14  | **Feature inventory vs PRD**      | **Process:** See [Maintenance](#maintenance) in this file; each release: sync [FEATURE-INVENTORY-LIVING.md](../requirements/FEATURE-INVENTORY-LIVING.md) and this guide when user-facing behavior changes.                                                                                                       |

---

## Maintenance

When you add a **new role**, **rename a primary route**, or **ship a net-new area** (e.g. a new `/company/...` hub), update this file and the feature inventory. Keep “what the user should do” **task-first**; keep **engineering paths** in the inventory, not here.

**Release process (per §13 item 14):** For every user-visible or permission-visible change, update **[FEATURE-INVENTORY-LIVING.md](../requirements/FEATURE-INVENTORY-LIVING.md)** (one truthful row) and, if the change affects _what a role should do_, a short note in this guide. If a PRD row exists, update that too so **sales, support, and code** do not disagree.
