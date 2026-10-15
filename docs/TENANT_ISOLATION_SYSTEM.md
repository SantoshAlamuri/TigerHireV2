# Automatic Tenant Isolation System

**Date:** 2026-03-19  
**Status:** Implemented

## Overview

We've implemented a robust, automatic tenant isolation system that ensures data access is always scoped to the correct tenant (organisation) without requiring manual checks in every query.

## Problem

Previously, developers had to manually:

1. Check if user has an organisation
2. Filter queries by `organisation_id`
3. Handle agency users (own org + client orgs)
4. Handle super_admin (can see all)
5. Remember to add these checks in every route

This was error-prone and led to potential tenant isolation gaps.

## Solution

We've created a **TenantScopedClient** that automatically enforces tenant isolation:

1. **Automatic Filtering** - All queries are automatically filtered by tenant
2. **Type Safety** - Tenant context is required, making it impossible to forget
3. **Agency Support** - Automatically handles agency + client orgs
4. **Super Admin Support** - Automatically bypasses filters for super_admin
5. **Consistent** - Same pattern everywhere, reducing bugs

## Architecture

### Components

1. **TenantContext** (`src/lib/tenancy/tenant-context.ts`)
   - Encapsulates tenant information
   - Resolves accessible organisation IDs (own org + client orgs for agency)

2. **TenantScopedClient** (`src/lib/tenancy/tenant-scoped-client.ts`)
   - Wrapper around Supabase client
   - Provides tenant-scoped methods for each table
   - Automatic filtering by accessible organisation IDs

3. **Query Helpers** (`src/lib/tenancy/query-helpers.ts`)
   - Utility functions for adding tenant filters
   - Used internally by TenantScopedClient

4. **API Helper** (`src/lib/api-helpers.ts`)
   - `getTenantScopedClient(ctx)` - Convenience function for API routes

## Usage

### Basic Example

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

### Accessing Resources by ID

```typescript
const db = await getTenantScopedClient(ctx);

// Assert a job belongs to tenant's accessible organisations
await db.assertJobAccess(jobId);

// Assert an application belongs to tenant (via job's organisation)
await db.assertApplicationAccess(applicationId);
```

### Available Methods

- `db.jobs()` - Jobs filtered by organisation_id
- `db.applications()` - Applications filtered by job's organisation_id
- `db.fitScores()` - Fit scores filtered by job's organisation_id
- `db.pipelineCandidates()` - Pipeline candidates filtered by job's organisation_id
- `db.candidateUnlocks()` - Unlocks filtered by organisation_id
- `db.organisations()` - Organisations filtered by accessible IDs
- `db.profiles()` - Profiles filtered by organisation_id
- `db.invites()` - Invites filtered by organisation_id
- `db.candidates()` - No automatic filter (use with access checks)

## Benefits

1. **Impossible to Forget** - Tenant context is required at the type level
2. **Automatic** - No manual filtering needed
3. **Consistent** - Same pattern everywhere
4. **Safe** - Works alongside RLS policies (defence in depth)
5. **Agency Support** - Automatically handles client orgs
6. **Super Admin Support** - Automatically bypasses filters

## Migration Path

### Before

```typescript
const supabase = await createSupabaseServerClient();
const { data: jobs } = await supabase
  .from("jobs")
  .select("*")
  .eq("organisation_id", ctx.organisationId); // ❌ Easy to forget!
```

### After

```typescript
const db = await getTenantScopedClient(ctx);
const { data: jobs } = await db.jobs().select("*"); // ✅ Automatic!
```

## Documentation

- **Usage Guide**: `src/lib/tenancy/README.md`
- **Examples**: `src/lib/tenancy/example-migration.ts`
- **API Reference**: See exported types in `src/lib/tenancy/index.ts`

## Next Steps

1. **Migrate existing routes** - Gradually migrate API routes to use `getTenantScopedClient()`
2. **Update repositories** - Consider updating repositories to use tenant-scoped client
3. **Add tests** - Add integration tests for tenant isolation
4. **Monitor** - Track usage and ensure all new routes use the system

## Security

This system provides:

- **Application-layer enforcement** - Automatic filtering in application code
- **Defence in depth** - Works alongside RLS policies
- **Type safety** - Impossible to forget tenant context
- **Consistency** - Same pattern everywhere

The system is designed to make tenant isolation the default, not an afterthought.
