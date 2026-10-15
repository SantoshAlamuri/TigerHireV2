# Route map — what to open, as which seat

A tested walkthrough of the product, one path per job-to-be-done. Every route below
was opened in a real browser as the seat named, on 2026-08-15.

Test accounts are on `/login` under **TEST ACCOUNTS (DEV ONLY)** — one click each.

---

## The main journey: job → approval → scored candidate

Do these in order. This is the path to test first.

| #   | Seat          | Open                           | You should see                                                       |
| --- | ------------- | ------------------------------ | -------------------------------------------------------------------- |
| 1   | Recruiter     | `/recruit/jobs`                | Jobs list + "REQUISITIONS — NOT OPEN YET"                            |
| 2   | Recruiter     | `/company/hiring-requests/new` | 4-step explainer, then fill + **Submit for review**                  |
| 3   | Company Admin | `/tasks`                       | The requisition under **Needs decision** → **Decide** → Approve      |
| 4   | Company Admin | `/tasks`                       | Approve **again** — this is a two-stage chain (leadership → finance) |
| 5   | —             | wait ~30s                      | AI drafts the JD in the background; requisition flips to `converted` |
| 6   | Recruiter     | `/recruit/jobs/<id>`           | Real job title + **Scoring setup** panel (the gate)                  |
| 7   | Recruiter     | same page                      | Confirm preset → approve rubric → scoring unblocks                   |

**Expect two approvals in step 3–4.** One approval advances a stage without flipping
the requisition — that is the workflow, not a broken button.

---

## By seat

### Recruiter — `rajiv.menon@finstack.in`

| Route                         | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `/recruit/jobs`               | Jobs (list + portfolio tabs)                             |
| `/recruit/pipeline`           | Everyone by stage, with scores — the richest screen      |
| `/recruit/candidates`         | In-process candidates grouped by job                     |
| `/recruit/applications`       | Application queue                                        |
| `/recruit/analytics`          | KPIs; says why a metric is missing rather than showing 0 |
| `/tasks`                      | Decisions waiting on you                                 |
| `/recruit/settings`           | Personal settings (integrations)                         |
| `/company/settings/templates` | Requisition + offer-letter templates                     |

### Company Admin / Leadership — `nidhi.gupta@finstack.in`

| Route                               | Purpose                              |
| ----------------------------------- | ------------------------------------ |
| `/recruit/v2/portfolio`             | Where each job is stuck, with owners |
| `/company/hiring-requests`          | All requisitions                     |
| `/company/approvals`, `/tasks`      | Approve requisitions and shortlists  |
| `/setup`                            | Org setup hub (**org admins only**)  |
| `/company/team`, `/company/billing` | People and plan                      |

### Hiring Manager — `kavita.rao@finstack.in`

`/company/my-jobs` · `/company/my-pipeline` · `/company/assessments` · `/company/interview-prep`

### Agency — `fatima.sheikh@talentbridge.co`

`/agency` · `/agency/jobs` · `/agency/clients` · `/agency/pipeline`

### Candidate — `priya.sharma@gmail.com`

`/candidate` · `/candidate/applications` · `/candidate/jobs` · `/candidate/profile`

### Employee — `meera.nair@finstack.in`

`/employee` (referral hub; sub-pages fold into it) · `/employee/resign`

### Super Admin — `sam@tigerhire.io`

`/admin` · `/admin/organisations` · `/admin/feature-flags` · `/admin/costs` · `/admin/audit-log`

---

## Rules this tree now follows

1. **One page = one canonical URL.** Where a page previously answered on two URLs
   via a re-export, the second URL now redirects. Old links keep working.
2. **A denial never shows a blank page.** Every unauthorized route redirects to
   that seat's own dashboard. `/setup/*` used to return a bare unstyled
   `Forbidden` body with no nav — it no longer does.
3. **Settings links resolve for the seat that can see them.** Recruiter hiring-config
   links land on `/company/settings/*`, which recruiters may open.

## Deliberate duplicates — do not "clean up"

Four pages intentionally answer on two URLs, because the two prefixes carry
**different role gates**. Collapsing them removes access for a seat:

| Both URLs                                              | Why                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- |
| `/company/assessments` + `/recruit/assessments`        | company path also admits hiring_manager + interviewer                           |
| `/company/interview-prep` + `/recruit/interview-prep`  | company path admits interviewer + hiring_manager; recruit path admits recruiter |
| `/company/offers` + `/recruit/offers`                  | recruit path admits super_admin                                                 |
| `/company/referrals` + `/setup/organization/referrals` | setup path admits finance, interviewer, employee org-admins                     |

`/recruit/analytics/legacy` is also kept: it is deliberately linked as
"Previous report →".

## Known, still open

- **`/recruit/offers` bounces to `/recruit/jobs`** — feature-gated (`offers`), pre-existing.
- **`/admin/*` as a non-super-admin** silently renders the Portfolio page rather than
  saying "not your seat".
- **`/recruit/v2/setup` shows false ✓s** — claims screening questions are configured
  when they are not.
