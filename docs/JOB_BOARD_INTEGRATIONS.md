# Job Board Integration Guide

This document outlines the status and integration process for all job boards connected to TigerHire's distribution engine.

## Current Integrations

### ✅ Implemented & Active

#### 1. **Indeed** (API-based)

- **Status:** ✅ Implemented
- **Type:** Direct API (GraphQL)
- **Connector:** `src/lib/distribution/connectors/indeed.ts`
- **Setup Required:**
  1. Sign up as Publisher at [indeed.com/publisher](https://indeed.com/publisher)
  2. Obtain OAuth credentials (client ID, client secret)
  3. Complete OAuth flow to get access token
  4. Set `INDEED_ACCESS_TOKEN` environment variable
- **Features:**
  - Automatic job posting via Job Sync API
  - Automatic job removal when closed
  - GraphQL-based with OAuth Bearer token auth
  - India location parsing support
- **Priority:** High (highest traffic in India)

#### 2. **idibu** (multipost + applications webhook)

- **Status:** ✅ Implemented
- **Type:** Posting iframe + inbound webhook (separate from `distributeJob()`)
- **Code:** `src/lib/integrations/idibu/`, `src/app/api/idibu/embed`, `src/app/api/webhooks/idibu/[organisationId]`
- **Setup (preferred):** Company Settings → **Job boards** — App ID, App Secret, Integration name, Webhook secret (per organisation, encrypted)
- **Setup (fallback):** Platform `IDIBU_*` env vars when `ALLOW_JOB_BOARD_GLOBAL_FALLBACK=true`
- **Docs:** [integrations/idibu-setup.md](./integrations/idibu-setup.md)
- **Features:**
  - Recruiters post via iframe on job detail (after JD base approved)
  - Applications ingested from idibu webhook; vacancy reference = TigerHire job UUID
  - Dead-letter queue for unmatched payloads (`idibu_dead_letter`)

#### 3. **Google for Jobs** (JSON-LD)

- **Status:** ✅ Live (no code changes needed)
- **Type:** Structured data (JSON-LD)
- **How it works:** Jobs automatically appear in Google search results as rich job cards
- **Setup:** Already implemented via JSON-LD schema on job pages
- **Features:**
  - Automatic indexing by Google
  - Rich job cards in search results
  - No API credentials needed

#### 4. **XML Feed** (Aggregator Feed)

- **Status:** ✅ Built and available
- **Type:** Public XML feed
- **Endpoint:** `https://tigerhire.io/api/jobs/feed.xml`
- **Features:**
  - Public, no authentication required
  - Returns all active (open) jobs
  - Cached for 1 hour
  - Includes job details, salary, location, apply URLs
- **Use cases:**
  - Partner aggregators can pull jobs programmatically
  - Reseller partners can integrate via feed
  - Any third-party can consume the feed

### 🔄 Business Setup Required

#### 5. **Jooble** (XML Feed Integration)

- **Status:** ⚠️ Ready for business setup
- **Type:** XML feed integration (not direct API)
- **Setup Process:**
  1. Create support ticket at [Jooble Help Center](https://jooblehelpcenter.freshdesk.com/en/support/tickets/new)
  2. In the ticket, specify:
     - Purpose: "ATS Integration - Job Posting"
     - XML Feed URL: `https://tigerhire.io/api/jobs/feed.xml`
     - Your company details and contact information
  3. Jooble will review your feed
  4. Once approved, they'll start pulling jobs automatically
  5. Applications can be routed back to your ATS
- **Timeline:** Typically 1-2 weeks for review and setup
- **Features:**
  - Automatic job pulling from XML feed
  - Applications routed back to TigerHire
  - No code changes needed (feed already exists)
- **Priority:** Medium (good India presence)

### ❌ Not Available / No API

#### 5. **Foundit** (formerly Monster India)

- **Status:** ❌ No direct API available
- **Type:** Manual posting or contact for partnership
- **Options:**
  - Manual posting via their website
  - Contact Foundit directly to inquire about publisher/partner programs
  - No programmatic API found
- **Priority:** Low (would require manual process)

#### 6. **Naukri**

- **Status:** ⚠️ API exists but requires paid subscription
- **Type:** Partner API (Zwayam Amplify)
- **Requirements:**
  - Paid Naukri subscription
  - Additional integration module cost
  - Zwayam Amplify API key (contact: amplify@zwayam.com)
  - Complex setup with webhooks
- **Priority:** Medium-High (India's #1 job board, but requires investment)
- **Future consideration:** Can be added if subscription is obtained

#### 7. **Shine.com**

- **Status:** ❌ No API found
- **Type:** Unknown
- **Priority:** Low

#### 8. **TimesJobs**

- **Status:** ❌ No official API found
- **Type:** Only scraping solutions available (not recommended)
- **Priority:** Low

## Integration Architecture

### Distribution Engine

The distribution engine (`src/lib/distribution/engine.ts`) handles:

- Pushing jobs to all configured boards
- Tracking distribution status in `job_distributions` table
- Removing jobs from boards when closed
- Error handling and logging

### Connector Pattern

Each board connector follows this pattern:

```typescript
// src/lib/distribution/connectors/{board}.ts
export interface JobForDistribution { ... }
export interface PushResult { ... }
export interface DeleteResult { ... }

export async function pushJobTo{Board}(
  job: JobForDistribution,
  organisationName: string,
  organisationSlug?: string | null,
): Promise<PushResult> { ... }

export async function deleteJobFrom{Board}(
  externalId: string
): Promise<DeleteResult> { ... }
```

### Adding a New Board

To add a new board connector:

1. **Create connector file:** `src/lib/distribution/connectors/{board}.ts`
   - Implement `pushJobTo{Board}()` function
   - Implement `deleteJobFrom{Board}()` function
   - Follow existing pattern from `adzuna.ts` or `indeed.ts`

2. **Update distribution engine:** `src/lib/distribution/engine.ts`
   - Add `BOARD_{BOARD} = "{board}"` constant
   - Import connector functions
   - Add to `DistributeResult` interface
   - Add push logic in `distributeJob()`
   - Add delete logic in `removeJobFromBoards()`

3. **Add environment variables:** `.env.example`
   - Document required API keys/tokens
   - Add setup instructions

4. **Test:**
   - Test with missing credentials
   - Test successful push
   - Test delete operation
   - Test error handling

## Environment Variables

### Current Required Variables

```bash
# Adzuna
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
ADZUNA_ADVERTISER_ID=  # Optional

# Indeed
INDEED_ACCESS_TOKEN=  # OAuth Bearer token
```

### Future Variables (if Naukri added)

```bash
# Naukri (requires paid subscription)
NAUKRI_API_KEY=  # Zwayam Amplify API key
NAUKRI_WEBHOOK_SECRET=
```

## Priority Recommendations

### For April Launch:

1. ✅ **Adzuna** - Already built, just needs env vars
2. ✅ **Google for Jobs** - Already live
3. ✅ **Indeed** - Implemented, needs OAuth setup
4. 🔄 **Jooble** - Submit XML feed URL to support (1-2 week process)

### Post-Launch:

5. **Naukri** - Consider if budget allows (requires paid subscription)
6. **Foundit** - Contact directly for partnership program
7. Other boards as opportunities arise

## Monitoring & Tracking

All job distributions are tracked in the `job_distributions` table:

- `job_id` - TigerHire job ID
- `board` - Board name (e.g., "adzuna", "indeed")
- `external_id` - External board's job ID
- `status` - "pushed" | "removed" | "failed"
- `pushed_at` - Timestamp when pushed
- `removed_at` - Timestamp when removed
- `error` - Error message if failed

## Support & Troubleshooting

### Common Issues

**Indeed:**

- OAuth token expired → Need to refresh token
- GraphQL errors → Check job data format, location parsing
- Missing credentials → Returns `success: false` gracefully

**Adzuna:**

- Missing API keys → Returns `success: false` gracefully
- Invalid advertiser ID → Job still posts but may not track properly

**Jooble:**

- Feed not being pulled → Contact Jooble support
- Jobs not appearing → Verify feed URL is accessible, check XML format

### Logs

All distribution operations are logged via `@/lib/observability/logger`:

- Success: Info level
- Failures: Error level with job ID and error details

## Future Enhancements

1. **OAuth Token Refresh:** Implement automatic token refresh for Indeed
2. **Multi-tenant Support:** Allow per-organisation credentials if needed
3. **Job Updates:** Add support for updating existing jobs (not just create/delete)
4. **Disposition Sync:** Integrate Indeed's Disposition Sync API to send candidate status updates
5. **Shared Types:** Extract common types to `src/lib/distribution/types.ts` to avoid duplication

## References

- [Indeed Partner Docs](https://docs.indeed.com/)
- [Adzuna Partner API](https://developer.adzuna.com/)
- [Jooble Help Center](https://help.jooble.org/)
- [Google for Jobs](https://developers.google.com/search/docs/appearance/structured-data/job-posting)
