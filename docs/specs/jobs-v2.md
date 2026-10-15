# TigerHire Jobs Page v2 — Cursor Handoff

**Status:** Spec, ready to build
**Owner:** Sam (solo dev via Cursor)
**Target stack:** Next.js 14 (App Router), Supabase (Postgres + RLS), TypeScript, Tailwind, shadcn/ui
**Estimated effort:** 4–6 working days
**Repo location:** save this as `/docs/specs/jobs-v2.md` and reference it from `.cursorrules`

---

## 1. Context

We are rebuilding TigerHire's `/jobs` page from a generic job board into a **two-tier curated marketplace** focused on 8 high-demand roles across 6 Indian metros + Remote. The page exists primarily as a **sales demo** — it shows hiring managers what their job will look like on TigerHire vs. a plain external listing.

Three strategic decisions are locked. Do not negotiate these during build:

1. **Two tiers, visibly different.** TigerHire-native jobs (posted by paying customers) get the premium card with FitScore + WhatsApp Apply. Aggregated jobs from third-party APIs get a plainer card with "View on [source]" external link. **No FitScore on external jobs** — better to show "FitScore unavailable" than fabricate one.
2. **Role-first, city-second.** Primary nav is 8 role pills. City is a secondary filter. This makes TigerHire a defensible specialty rather than a Naukri clone.
3. **India only. Six metros + Remote.** No tier-2 cities yet. Bangalore is the default landing city and marketing focus.

---

## 2. In Scope (this sprint)

- Supabase schema additions to `jobs` table
- 4 ingestion adapters: Greenhouse, Lever, Adzuna, JSearch via RapidAPI
- Normalization + dedup pipeline
- Role classification (keyword-first, LLM fallback for unmatched)
- `/jobs` page redesign: two-tier cards, role pills, city tags, "TigerHire only" toggle
- Cron-driven sync (daily, 03:00 IST)
- Empty states + skeleton loaders

### Out of scope (defer until we have paying customers)

- Salary parsing on external jobs (data often missing — don't fabricate)
- Saved searches / job alerts
- Candidate-side saved jobs
- Search box (the 8 role pills _are_ the discovery surface)
- Tier-2 cities, non-India jobs
- A real FitScore for external jobs (deferred until we have a reliable JD-only model)
- More than 8 role categories

---

## 3. Data Model

Migration on `jobs` table (Supabase Postgres):

```sql
alter table jobs
  add column source text not null default 'tigerhire',
  add column source_url text,
  add column source_job_id text,
  add column tier text not null default 'native' check (tier in ('native','aggregated')),
  add column role_category text check (role_category in (
    'backend','frontend','data_ml','product','devops','design','sales','finance'
  )),
  add column city text check (city in ('bangalore','delhi_ncr','mumbai','hyderabad','chennai','pune','remote')),
  add column posted_at timestamptz,
  add column fetched_at timestamptz default now(),
  add column dedup_fingerprint text,
  add column is_active boolean default true;

create unique index jobs_source_dedup_idx
  on jobs(source, source_job_id) where source != 'tigerhire';

create index jobs_dedup_fingerprint_idx on jobs(dedup_fingerprint);

create index jobs_filter_idx
  on jobs(tier, role_category, city, is_active, posted_at desc);

create table if not exists sync_logs (
  id bigserial primary key,
  source text not null,
  started_at timestamptz default now(),
  ended_at timestamptz,
  jobs_fetched int default 0,
  jobs_inserted int default 0,
  jobs_updated int default 0,
  jobs_dropped int default 0,
  error text
);
```

**RLS:** Native jobs follow existing tenant rules. Aggregated jobs are read-only and globally readable — no `tenant_id`.

---

## 4. Source Integrations

Create `lib/jobs/sources/` with one adapter per source. Each adapter exports a single `fetch()` returning `NormalizedJob[]`.

### 4.1 Greenhouse (free, public, no key required)

- Endpoint: `https://boards-api.greenhouse.io/v1/boards/{company_slug}/jobs?content=true`
- Seed: `data/greenhouse_companies.json` — start with 30 Indian-presence companies (Razorpay, Cred, Zerodha, Postman, Atlan, Hasura, etc.)
- One fetch per company; pool all results
- **Highest data quality** — keep these on top within the aggregated tier

### 4.2 Lever (free, public, no key required)

- Endpoint: `https://api.lever.co/v0/postings/{company_slug}?mode=json`
- Seed: `data/lever_companies.json` — start with 30
- Same pattern as Greenhouse

### 4.3 Adzuna (free tier — 5,000 calls/month)

- Endpoint: `https://api.adzuna.com/v1/api/jobs/in/search/{page}`
- Env: `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`
- One call per role × city combination = 8 × 7 = 56 calls per nightly sync, well under quota
- Use `where=` for city, `what=` for role keywords

### 4.4 JSearch via RapidAPI (~$10/mo)

- Endpoint: `https://jsearch.p.rapidapi.com/search`
- Env: `RAPIDAPI_KEY`
- Aggregates LinkedIn / Indeed / Glassdoor — **legally critical that we use this instead of scraping those directly**
- One call per role × city, same pattern as Adzuna

### Adapter rules (all sources)

- Rate-limit: 1 request / 2s per domain via a simple in-process queue
- Catch per-company / per-call failures without crashing the whole sync
- Return `{ raw, normalized }` so we can debug source-side issues
- Log every run to `sync_logs`

---

## 5. Normalization

Common schema:

```typescript
type NormalizedJob = {
  source: "greenhouse" | "lever" | "adzuna" | "jsearch";
  source_job_id: string;
  source_url: string;
  title: string;
  company: string;
  description: string; // first 5,000 chars only
  city: City; // via city-mapper, see §5.1
  role_category: RoleCategory | null; // see §6
  posted_at: Date | null;
  raw: unknown; // keep for debugging
};
```

### 5.1 City mapping — `lib/jobs/city-mapper.ts`

Takes free-text location, returns canonical city or `null` (drop the job).

- **NCR rollup:** Delhi, Gurgaon, Gurugram, Noida, Faridabad, Ghaziabad → `delhi_ncr`
- **Bangalore variants:** Bangalore, Bengaluru, Bangalore Urban, Whitefield, Electronic City, Koramangala, etc. → `bangalore`
- **Remote detection:** contains "remote" / "work from home" / "wfh" / "anywhere in india" → `remote`, regardless of any city also mentioned
- **Other India cities:** drop (return `null`)
- **Non-India:** drop

### 5.2 Dedup fingerprint

```
fingerprint = sha256(
  normalize(title) + "|" +
  normalize(company) + "|" +
  city + "|" +
  first_200_chars(normalize(description))
)
```

Where `normalize` = lowercase, strip punctuation, collapse whitespace.

On insert: if fingerprint exists, keep the one with the most recent `posted_at` and mark the other `is_active = false`. **Source priority on tie:** Greenhouse > Lever > Adzuna > JSearch (closer to the source = better data).

---

## 6. Role Classification — `lib/jobs/role-classifier.ts`

### 6.1 Keyword-first (fast, free, deterministic)

```typescript
const ROLE_KEYWORDS: Record<RoleCategory, string[]> = {
  backend: [
    "backend engineer",
    "backend developer",
    "java developer",
    "python developer",
    "node.js developer",
    "golang",
    "sde backend",
    "server engineer",
  ],
  frontend: [
    "frontend",
    "react developer",
    "next.js",
    "ui developer",
    "javascript developer",
    "angular developer",
    "vue developer",
  ],
  data_ml: [
    "data engineer",
    "machine learning",
    "ml engineer",
    "data scientist",
    "ai engineer",
    "mlops",
    "analytics engineer",
  ],
  product: [
    "product manager",
    "product owner",
    "group product manager",
    "gpm",
    "apm",
    "associate product manager",
  ],
  devops: [
    "devops",
    "sre",
    "site reliability",
    "platform engineer",
    "infrastructure engineer",
    "cloud engineer",
    "kubernetes engineer",
  ],
  design: [
    "product designer",
    "ux designer",
    "ui designer",
    "ux/ui designer",
    "visual designer",
    "interaction designer",
  ],
  sales: [
    "sales executive",
    "account executive",
    "sdr",
    "sales development",
    "business development",
    "inside sales",
    "enterprise sales",
  ],
  finance: [
    "financial analyst",
    "finance manager",
    "accountant",
    "controller",
    "fp&a",
    "financial controller",
    "revenue analyst",
  ],
};
```

- Match on `title` first (highest signal)
- If no match, scan first 500 chars of `description`
- Score = keyword hits; assign highest-scoring role if score ≥ 2, else `null`

### 6.2 LLM fallback (only for unmatched jobs)

For jobs that don't classify via keywords:

- Batch in groups of 10
- Call Claude Haiku 4.5 with a tight prompt returning `role_category` or `null`
- Cap at 200 LLM calls per sync (~₹20/day)
- Anything still `null` is dropped, not stored

**Jobs with `role_category = null` never appear on the page.** The page is curated by definition.

---

## 7. Backend Endpoints

### `GET /api/jobs`

Query params:

- `role` — one of 8 categories or `"all"`, default `"all"`
- `city` — one of 7 or `"all"`, default candidate's detected city or `"bangalore"`
- `tier` — `"all"` | `"native"`, default `"all"`
- `cursor` — for pagination

Returns: `{ jobs: Job[], nextCursor: string | null, counts: { native: number, aggregated: number } }`.

**Ordering:** Native jobs always first within the page, sorted by `posted_at desc`. Aggregated jobs follow.

### `POST /api/jobs/sync`

- Protected by `SYNC_SECRET` header
- Triggered by Vercel Cron daily at 03:00 IST
- Runs all 4 adapters → normalize → classify → dedup → upsert
- Logs counts per source to `sync_logs`
- Marks jobs as `is_active = false` if not seen for 14 consecutive days

---

## 8. Frontend — `/jobs` Page

### 8.1 Layout (top to bottom)

1. **Page header:** title + dynamic count — "1,247 jobs across 8 roles in India"
2. **Tier toggle** (right-aligned segmented control): `[All jobs] [TigerHire only]`
3. **Role pills row** — primary, large: `Backend · Frontend · Data/ML · Product · DevOps · Design · Sales · Finance` (horizontally scrollable on mobile)
4. **City pills row** — secondary, smaller: `Bangalore · Delhi-NCR · Mumbai · Hyderabad · Chennai · Pune · Remote`
5. **Jobs feed** — native cards first, then aggregated

### 8.2 TigerHire-native card

- Top-left: company logo (48×48) + verified blue check
- Title (16px semibold)
- Company name + city
- **FitScore badge** prominent on the right — circular, large, color-coded: green ≥ 85, amber 70–84, grey < 70. For logged-out candidates: "Sign in to see your FitScore"
- Pipeline status line: "12 applicants · shortlist closes Fri" (only if real data exists — never fabricate)
- Recruiter chip: avatar + name + "active 2m ago" / "active today" (hide entirely if `recruiter_last_active` is null)
- Salary range if available
- Primary CTA: **green "Apply on WhatsApp" button** with WhatsApp icon
- Posted date in green if < 7 days old

### 8.3 Aggregated card (visually plainer)

- Smaller height, no logo (company initials in a muted circle if no logo)
- Title (15px medium)
- Company + city + small **"via Indeed"** / **"via Greenhouse"** tag (12px muted)
- **No FitScore badge** — instead muted text: "FitScore unavailable for external jobs"
- No recruiter info
- No pipeline data
- Posted date as-is (even if stale — honest)
- Primary CTA: **outline button** "View on [source] ↗" — opens `source_url` in new tab with `rel="noopener noreferrer"`

### 8.4 Toggle behavior

- **All jobs** (default): both tiers, native first
- **TigerHire only:** filter to `tier = 'native'`. If zero results for current role/city, show empty state:
  > "We don't have native jobs in this role/city yet. Switch to _All jobs_ to see external listings — or [post one yourself for free →]"

### 8.5 Empty / loading states

- Skeleton loaders matching card shapes: 3 native + 5 aggregated placeholders
- Empty: tasteful illustration + "No jobs match this filter yet. Try a different role or city."

### 8.6 Tracking events

Fire to existing analytics:

- `jobs_page_view` (role, city, tier)
- `role_pill_click` (from_role, to_role)
- `tier_toggle` (from, to)
- `job_card_view` (job_id, tier)
- `apply_click` (job_id, tier, source)
- `external_apply_click` (job_id, source) — **critical metric: tells us how much value the aggregated tier creates**

---

## 9. FitScore Display Rules (Codified)

| Job tier   | Candidate logged in | Behaviour                                            |
| ---------- | ------------------- | ---------------------------------------------------- |
| native     | yes                 | Compute and display real FitScore                    |
| native     | no                  | Show "Sign in to see your FitScore" with sign-in CTA |
| aggregated | yes                 | Muted text: "FitScore unavailable for external jobs" |
| aggregated | no                  | Same as above                                        |

**Do not fabricate or estimate FitScores on external jobs.** Honesty here is product credibility.

---

## 10. Cron & Sync

`vercel.json`:

```json
{
  "crons": [{ "path": "/api/jobs/sync?source=all", "schedule": "30 21 * * *" }]
}
```

(21:30 UTC = 03:00 IST.) Can split per-source later if quotas demand it.

---

## 11. Acceptance Criteria

Build is done when **all** of these are true:

1. `/jobs` defaults to "All jobs, Backend role, Bangalore city" for a logged-out visitor
2. At least 200 aggregated jobs exist in DB across the 8 roles after first sync
3. Native and aggregated cards are visually distinct (different layouts, CTAs, FitScore behavior)
4. Toggling "TigerHire only" filters to native tier exclusively
5. Role and city pills update the feed without full page reload
6. External "View on [source]" links open in new tab with `rel="noopener noreferrer"`
7. No FitScore appears on any aggregated job in any state
8. Cron sync runs successfully end-to-end and logs counts to `sync_logs`
9. Mobile (< 640px) is usable — horizontally scrollable pills, full-width cards
10. Lighthouse performance ≥ 85 on the jobs page

---

## 12. Environment Variables

Add to `.env.local` and Vercel:

```
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
RAPIDAPI_KEY=
SYNC_SECRET=          # generate a random 32-char string
ANTHROPIC_API_KEY=    # for role classification LLM fallback
```

---

## 13. Build Order

Top-to-bottom, no parallelization until §7 contract is set:

1. §3 — schema migration
2. §4 — Greenhouse adapter first (free, no auth, simplest), then Lever, then Adzuna, then JSearch
3. §5 — normalization + city mapper + dedup
4. §6 — role classifier (keyword first, then LLM fallback)
5. §7 — backend endpoints, test with curl
6. §8 — frontend (can start in parallel against mocked API responses once §7 contract is defined)
7. §10 — wire cron
8. §11 — verify all 10 acceptance criteria

---

## 14. Notes / Risks for Cursor

- **Greenhouse/Lever seed lists** — start with 30 each. Don't auto-discover companies yet.
- **Adzuna India coverage is patchy** in Finance and Design — that's fine for v1.
- **JSearch overlaps heavily with Adzuna** — dedup will catch most. Don't disable JSearch; LinkedIn-sourced rows there are higher quality than Adzuna's.
- **Resist the urge to add a search box.** The 8 pills are the entire discovery surface.
- **Don't fake recruiter info on native jobs.** If `recruiter_last_active` is null, hide the chip entirely.
- **Don't compute FitScores for aggregated jobs**, even if it would be technically easy. Product credibility > apparent feature parity.

---

_End of spec._
