# Migration Guide: Using TenantScopedClient

This guide shows how to migrate existing API routes to use `getTenantScopedClient()` for automatic tenant isolation.

## Quick Migration Pattern

### Before

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const supabase = await createSupabaseServerClient();

  // Manual checks
  if (!ctx.organisationId) {
    return jsonError("No organisation", 400);
  }

  // Manual filtering
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("organisation_id", ctx.organisationId);

  // Manual agency check
  if (ctx.role === "agency") {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    // ... more manual code
  }

  return jsonSuccess({ jobs });
}
```

### After

```typescript
import { getTenantScopedClient } from "@/lib/api-helpers";
import { ForbiddenError, handleTenantError } from "@/lib/tenancy";

export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const db = await getTenantScopedClient(ctx);

  // Automatic filtering - no manual checks needed!
  const { data: jobs } = await db.jobs().select("*");

  return jsonSuccess({ jobs });
}
```

## Migration Steps

### Step 1: Update Imports

```typescript
// Remove
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Add
import { getTenantScopedClient } from "@/lib/api-helpers";
import { ForbiddenError, handleTenantError } from "@/lib/tenancy";
```

### Step 2: Replace Client Creation

```typescript
// Before
const supabase = await createSupabaseServerClient();

// After
const db = await getTenantScopedClient(ctx);
```

### Step 3: Replace Manual Checks with Assertions

```typescript
// Before
const job = await JobService.getById(supabase, id);
if (job.organisation_id !== ctx.organisationId && ctx.role !== "super_admin") {
  return jsonError("Forbidden", 403);
}

// After
try {
  await db.assertJobAccess(id);
} catch (error) {
  const tenantError = handleTenantError(error, {
    userId: ctx.userId,
    organisationId: ctx.organisationId,
    role: ctx.role,
    resourceType: "job",
    resourceId: id,
  });
  if (tenantError.isForbidden) {
    return jsonError("Forbidden", 403);
  }
  throw error;
}
const job = await JobService.getById(db.raw, id);
```

### Step 4: Use Tenant-Scoped Methods

```typescript
// Before
const { data: jobs } = await supabase
  .from("jobs")
  .select("*")
  .eq("organisation_id", ctx.organisationId);

// After
const { data: jobs } = await db.jobs().select("*");
```

### Step 5: Access Raw Client When Needed

```typescript
// If you need the raw Supabase client (e.g., for services)
const job = await JobService.getById(db.raw, id);
```

## Common Patterns

### Pattern 1: List Resources

```typescript
// Automatic filtering by tenant
const { data: jobs } = await db
  .jobs()
  .select("*")
  .eq("status", "open")
  .order("created_at", { ascending: false });
```

### Pattern 2: Get Resource by ID

```typescript
// Assert access first
await db.assertJobAccess(jobId);

// Then fetch
const { data: job } = await db.jobs().select("*").eq("id", jobId).single();
```

### Pattern 3: Applications (RLS-Protected)

```typescript
// Applications are protected by RLS via job's organisation_id
// No need for explicit filtering, but you can use tenant-scoped client
const { data: applications } = await db
  .applications()
  .select("*, jobs(id, title)")
  .eq("status", "applied");
```

### Pattern 4: Agency Users

```typescript
// Agency users automatically get access to own org + client orgs
// No manual agency_clients check needed!
const { data: jobs } = await db.jobs().select("*");
```

### Pattern 5: Super Admin

```typescript
// Super admin automatically bypasses filters
const { data: jobs } = await db.jobs().select("*"); // Returns ALL jobs
```

## Error Handling

### With Monitoring

```typescript
import { handleTenantError } from "@/lib/tenancy";

try {
  await db.assertJobAccess(jobId);
} catch (error) {
  const tenantError = handleTenantError(error, {
    userId: ctx.userId,
    organisationId: ctx.organisationId,
    role: ctx.role,
    resourceType: "job",
    resourceId: jobId,
  });
  if (tenantError.isForbidden) {
    return jsonError("Forbidden", 403);
  }
  throw error;
}
```

### Simple Error Handling

```typescript
import { ForbiddenError } from "@/lib/tenancy";

try {
  await db.assertJobAccess(jobId);
} catch (error) {
  if (error instanceof ForbiddenError) {
    return jsonError("Forbidden", 403);
  }
  throw error;
}
```

## Migration Checklist

For each route:

- [ ] Update imports
- [ ] Replace `createSupabaseServerClient()` with `getTenantScopedClient(ctx)`
- [ ] Remove manual organisation checks
- [ ] Remove manual agency client checks
- [ ] Replace manual filters with tenant-scoped methods
- [ ] Replace manual access checks with `assertJobAccess()` / `assertApplicationAccess()`
- [ ] Add error handling with monitoring
- [ ] Test with different user roles (regular, agency, super_admin)
- [ ] Verify cross-tenant access is blocked

## Examples

See `src/lib/tenancy/example-migration.ts` for more examples.

## Benefits After Migration

1. ✅ **Simpler code** - No manual tenant checks
2. ✅ **Consistent** - Same pattern everywhere
3. ✅ **Type-safe** - Tenant context required
4. ✅ **Automatic** - Agency clients handled automatically
5. ✅ **Monitored** - Violations tracked automatically

## Notes

- Existing routes continue to work (RLS protects them)
- Migration is optional but recommended for consistency
- Can migrate gradually, route by route
- Services that use raw client still work (use `db.raw`)
