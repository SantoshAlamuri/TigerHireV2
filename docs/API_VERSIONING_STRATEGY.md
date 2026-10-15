# API Versioning Strategy

## Current State

TigerHire currently has **116+ flat REST endpoints** under `/api/` with no versioning:

- `/api/jobs` - Job CRUD operations
- `/api/candidates` - Candidate search and retrieval
- `/api/fit-score` - FitScore computation and retrieval
- `/api/organisations` - Organization management
- `/api/admin/*` - Admin operations
- `/api/billing/*` - Stripe integration
- `/api/auth/*` - Authentication endpoints
- And many more...

All endpoints are unversioned, making it difficult to introduce breaking changes without disrupting existing clients.

## Recommended Approach: URL Prefix Versioning

Use **URL prefix versioning** (`/api/v1/...`) as the primary versioning strategy:

- **Clear and Explicit**: Version is visible in the URL
- **Cache-Friendly**: Different versions can be cached separately
- **Easy to Route**: Next.js route handlers can easily distinguish versions
- **Industry Standard**: Most REST APIs use this pattern

### Migration Plan

#### Phase 1: Add Versioned Routes (Non-Breaking)

1. Create `/api/v1/` routes that proxy to existing endpoints:

   ```typescript
   // src/app/api/v1/jobs/route.ts
   export async function GET(request: NextRequest) {
     // Proxy to /api/jobs
     return await jobsRoute.GET(request);
   }
   ```

2. Mark current routes as `/api/v1/` internally:
   - Add comments indicating they are v1
   - Update API documentation to reference `/api/v1/`
   - Keep existing routes working for backward compatibility

#### Phase 2: Gradual Migration

1. Update frontend to use `/api/v1/` endpoints
2. Monitor usage of old endpoints via logging
3. Add deprecation warnings to old endpoints (via response headers)

#### Phase 3: Breaking Changes

When breaking changes are needed:

1. Create `/api/v2/` routes with new behavior
2. Keep `/api/v1/` routes for backward compatibility
3. Document migration path from v1 to v2
4. Set sunset date for v1 (e.g., 6 months after v2 launch)

### Alternative: Header-Based Versioning

As an alternative, consider header-based versioning:

```
Accept: application/vnd.tigerhire.v1+json
```

**Pros:**

- Cleaner URLs (no version in path)
- Better for hypermedia APIs

**Cons:**

- Less discoverable
- Harder to cache
- Requires custom middleware

**Recommendation**: Use URL prefix versioning for simplicity and clarity.

## Versioning Guidelines

### When to Version

- **Breaking Changes**: Changes that break existing clients
  - Removing fields
  - Changing field types
  - Changing required fields
  - Changing response structure
  - Changing authentication requirements

- **Non-Breaking Changes**: Can be made without versioning
  - Adding optional fields
  - Adding new endpoints
  - Adding new query parameters
  - Improving error messages

### Version Format

- Use semantic versioning: `v1`, `v2`, `v3`
- Avoid point releases in URLs: `/api/v1.1/` (use headers for minor versions if needed)
- Major versions indicate breaking changes

### Deprecation Policy

1. **Announcement**: Announce deprecation 3 months in advance
2. **Warning Headers**: Add `Deprecation: true` and `Sunset: <date>` headers
3. **Documentation**: Update API docs with migration guides
4. **Monitoring**: Track usage of deprecated endpoints
5. **Removal**: Remove after sunset date (minimum 6 months)

## Implementation Example

```typescript
// src/app/api/v1/jobs/route.ts
import { GET as jobsGET, POST as jobsPOST } from "@/app/api/jobs/route";

export async function GET(request: NextRequest) {
  // Add version header
  const response = await jobsGET(request);
  response.headers.set("API-Version", "v1");
  return response;
}

export async function POST(request: NextRequest) {
  const response = await jobsPOST(request);
  response.headers.set("API-Version", "v1");
  return response;
}
```

## Timeline

This migration is **non-breaking** and can be done incrementally:

1. **Week 1-2**: Create `/api/v1/` proxy routes
2. **Week 3-4**: Update frontend to use `/api/v1/`
3. **Week 5+**: Monitor and gradually deprecate old routes

No immediate action required; this can be implemented when breaking changes are needed.

## References

- Current API routes: `src/app/api/`
- Next.js routing: [Next.js App Router Documentation](https://nextjs.org/docs/app/building-your-application/routing)
