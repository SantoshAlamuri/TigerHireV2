# Tenant Isolation System

This module provides a robust, automatic tenant isolation system that ensures data access is always scoped to the correct tenant (organisation) without requiring manual checks in every query.

## Architecture

The tenant isolation system consists of:

1. **TenantContext** - Encapsulates tenant information including accessible organisation IDs
2. **TenantScopedClient** - Wrapper around Supabase client that automatically filters queries by tenant
3. **Query Helpers** - Utility functions for adding tenant filters to queries

## Usage

### Basic Usage in API Routes

```typescript
import { getAuthContext, requireAuth, getTenantScopedClient, jsonSuccess } from "@/lib/api-helpers";

export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  // Get tenant-scoped client - automatically enforces tenant isolation
  const db = await getTenantScopedClient(ctx);

  // Query jobs - automatically filtered by accessible organisation IDs
  const { data: jobs } = await db.jobs().select("*").eq("status", "open");

  return jsonSuccess({ jobs });
}
```

### Accessing Different Tables

```typescript
const db = await getTenantScopedClient(ctx);

// Jobs - filtered by organisation_id
const jobs = await db.jobs().select("*");

// Applications - filtered by job's organisation_id (via join)
const applications = await db.applications().select("*");

// Fit Scores - filtered by job's organisation_id
const scores = await db.fitScores().select("*");

// Pipeline Candidates - filtered by job's organisation_id
const pipeline = await db.pipelineCandidates().select("*");

// Candidate Unlocks - filtered by organisation_id
const unlocks = await db.candidateUnlocks().select("*");

// Organisations - filtered by accessible organisation IDs
const orgs = await db.organisations().select("*");

// Profiles - filtered by organisation_id
const profiles = await db.profiles().select("*");

// Invites - filtered by organisation_id
const invites = await db.invites().select("*");

// Candidates - no automatic filter (use with access checks)
const candidates = await db.candidates().select("*");
```

### Asserting Resource Access

```typescript
const db = await getTenantScopedClient(ctx);

// Assert a job belongs to tenant's accessible organisations
await db.assertJobAccess(jobId);

// Assert an application belongs to tenant (via job's organisation)
await db.assertApplicationAccess(applicationId);

// Assert any resource belongs to tenant
await db.assertResourceAccess("table_name", resourceId, "organisation_id_column");
```

### Using Query Helpers Directly

If you need to use the raw Supabase client but still want tenant filtering:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createTenantContext } from "@/lib/tenancy/tenant-context";
import { addOrganisationFilter } from "@/lib/tenancy/query-helpers";

const supabase = await createSupabaseServerClient();
const tenantContext = await createTenantContext(ctx);

// Add organisation filter to any query
const query = supabase.from("jobs").select("*");
const filteredQuery = addOrganisationFilter(query, tenantContext);
const { data } = await filteredQuery;
```

### Super Admin Access

Super admins automatically bypass tenant filters:

```typescript
const db = await getTenantScopedClient(ctx);

// For super_admin, this returns ALL jobs
// For others, returns only their org's jobs
const { data: jobs } = await db.jobs().select("*");
```

### Agency Users

Agency users automatically get access to their own org + client orgs:

```typescript
const db = await getTenantScopedClient(ctx);

// For agency users, this includes:
// - Jobs from their own organisation
// - Jobs from all client organisations (via agency_clients table)
const { data: jobs } = await db.jobs().select("*");
```

## Migration Guide

### Before (Manual Tenant Checks)

```typescript
export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const supabase = await createSupabaseServerClient();

  // Manual tenant check - easy to forget!
  if (!ctx.organisationId) {
    return jsonError("No organisation", 400);
  }

  // Manual filter - easy to forget!
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("organisation_id", ctx.organisationId);

  return jsonSuccess({ jobs });
}
```

### After (Automatic Tenant Isolation)

```typescript
export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const db = await getTenantScopedClient(ctx);

  // Automatic tenant filtering - impossible to forget!
  const { data: jobs } = await db.jobs().select("*");

  return jsonSuccess({ jobs });
}
```

## Benefits

1. **Type Safety** - Tenant context is required, making it impossible to forget tenant checks
2. **Automatic Filtering** - All queries are automatically filtered by tenant
3. **Agency Support** - Automatically handles agency + client orgs
4. **Super Admin Support** - Automatically bypasses filters for super_admin
5. **Consistent** - Same pattern everywhere, reducing bugs
6. **Defence in Depth** - Works alongside RLS policies

## Best Practices

1. **Always use `getTenantScopedClient()` in API routes** - Never use `createSupabaseServerClient()` directly for tenant-scoped data
2. **Use assertion methods** - Use `assertJobAccess()`, `assertApplicationAccess()` when accessing resources by ID
3. **Prefer tenant-scoped methods** - Use `db.jobs()`, `db.applications()`, etc. instead of `db.from("jobs")`
4. **Document exceptions** - If you must use raw client, document why and add explicit tenant checks

## Error Handling

The tenant-scoped client throws `ForbiddenError` (status 403) when:

- Resource doesn't belong to tenant's accessible organisations
- Resource not found

```typescript
try {
  await db.assertJobAccess(jobId);
} catch (error) {
  if (error instanceof ForbiddenError) {
    return jsonError("Forbidden", 403);
  }
  throw error;
}
```
