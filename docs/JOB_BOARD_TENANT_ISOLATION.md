# Job Board Credentials - Tenant Isolation Implementation

## Critical Security Fix

**Issue:** The original implementation used global environment variables for job board credentials, meaning ALL organisations shared the same API keys. This was a **critical data breach risk** - all jobs from all companies would be posted under one account.

**Solution:** Implemented per-organisation credential storage with encryption and tenant isolation.

## Implementation Summary

### 1. Database Schema

**Migration:** `supabase/migrations/20260319000000_organisation_job_board_credentials.sql`

- Created `organisation_job_board_credentials` table
- Stores encrypted credentials per organisation per board
- RLS policies ensure organisations can only access their own credentials
- Tracks `last_used_at` for monitoring

### 2. Encryption

**File:** `src/lib/security/credentials-encryption.ts`

- Uses AES-256-GCM for authenticated encryption
- Encryption key from `JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY` env var
- Credentials encrypted before storage, decrypted on read

### 3. Credential Management

**File:** `src/lib/distribution/credentials.ts`

- Helper functions to fetch and decrypt org-specific credentials
- Falls back to global env vars for backward compatibility
- Updates `last_used_at` on credential usage

### 4. Updated Connectors

**Files:**

- `src/lib/distribution/connectors/adzuna.ts`
- `src/lib/distribution/connectors/indeed.ts`

**Changes:**

- Accept `organisationId` parameter
- Fetch org-specific credentials via `getAdzunaCredentials()` / `getIndeedCredentials()`
- Fall back to global env vars if no org credentials found

### 5. Distribution Engine

**File:** `src/lib/distribution/engine.ts`

**Changes:**

- Passes `organisationId` to all connector functions
- Ensures tenant isolation throughout the distribution flow

### 6. API Routes

**File:** `src/app/api/org/job-board-credentials/route.ts`

**Endpoints:**

- `GET /api/org/job-board-credentials?board=adzuna` - Get credential status (metadata only)
- `POST /api/org/job-board-credentials` - Set/update credentials
- `DELETE /api/org/job-board-credentials?board=adzuna` - Delete credentials

**Security:**

- Only `company_admin` and `super_admin` can manage credentials
- RLS ensures organisations can only access their own credentials
- Credentials never returned in API responses (only metadata)

### 7. UI Component

**File:** `src/app/(dashboard)/company/settings/page.tsx`

**Features:**

- "Job Board Integrations" section in company settings
- Configure Adzuna credentials (App ID, App Key, Advertiser ID)
- Configure Indeed credentials (Access Token)
- View credential status and last used date
- Delete credentials
- Password masking for sensitive fields

## Setup Instructions

### 1. Generate Encryption Key

```bash
openssl rand -hex 32
```

Add to `.env.local`:

```
JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY=<generated-key>
```

### 2. Run Migration

```bash
# Apply the migration
supabase migration up
```

### 3. Configure Credentials (Per Organisation)

1. Navigate to `/company/settings`
2. Scroll to "Job Board Integrations" section
3. Click "Configure" for Adzuna or Indeed
4. Enter credentials:
   - **Adzuna:** App ID, App Key, Advertiser ID (optional)
   - **Indeed:** OAuth Access Token
5. Click "Save"

## Backward Compatibility

- If no org-specific credentials are configured, connectors fall back to global env vars
- This allows gradual migration without breaking existing setups
- Global env vars can be removed once all organisations have configured their own credentials

## Security Features

1. **Encryption at Rest:** All credentials encrypted using AES-256-GCM
2. **RLS Policies:** Database-level tenant isolation
3. **API Authorization:** Only company admins can manage credentials
4. **No Credential Exposure:** API never returns decrypted credentials
5. **Audit Trail:** `last_used_at` tracks credential usage

## Testing

1. **Test per-org credentials:**
   - Configure credentials for Organisation A
   - Post a job from Organisation A
   - Verify job uses Organisation A's credentials
   - Configure different credentials for Organisation B
   - Post a job from Organisation B
   - Verify job uses Organisation B's credentials

2. **Test fallback:**
   - Remove org credentials
   - Verify fallback to global env vars works

3. **Test security:**
   - Try accessing another org's credentials via API (should fail)
   - Verify RLS policies prevent cross-tenant access

## Future Enhancements

1. **Credential Rotation:** Automatic token refresh for Indeed OAuth
2. **Credential Validation:** Test credentials before saving
3. **Usage Analytics:** Dashboard showing credential usage per board
4. **Multi-board Support:** Add more boards (Naukri, Foundit, etc.) with same pattern
