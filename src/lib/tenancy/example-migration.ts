/**
 * Example: Migrating an API route to use tenant-scoped client
 *
 * This file shows before/after examples of migrating routes to use
 * the automatic tenant isolation system.
 */

// ============================================================================
// BEFORE: Manual tenant checks (error-prone)
// ============================================================================

/*
import { getAuthContext, requireAuth, jsonError, jsonSuccess } from "@/lib/api-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  // ❌ Manual check - easy to forget!
  if (!ctx.organisationId) {
    return jsonError("No organisation", 400);
  }

  const supabase = await createSupabaseServerClient();

  // ❌ Manual filter - easy to forget!
  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .eq("organisation_id", ctx.organisationId)
    .eq("status", "open");

  // ❌ What about agency users? Need to handle client orgs manually
  if (ctx.role === "agency") {
    const { data: links } = await supabase
      .from("agency_clients")
      .select("client_organisation_id")
      .eq("agency_organisation_id", ctx.organisationId);
    const clientIds = (links ?? []).map(r => r.client_organisation_id);
    // ... more manual code
  }

  return jsonSuccess({ jobs });
}
*/

// ============================================================================
// AFTER: Automatic tenant isolation (robust)
// ============================================================================

/*
import { getAuthContext, requireAuth, getTenantScopedClient, jsonError, jsonSuccess } from "@/lib/api-helpers";

export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  // ✅ Get tenant-scoped client - automatically handles all tenant logic
  const db = await getTenantScopedClient(ctx);

  // ✅ Automatic filtering - includes own org + client orgs for agency
  // ✅ Super admin automatically sees all
  // ✅ No manual checks needed!
  const { data: jobs } = await db.jobs()
    .select("*")
    .eq("status", "open");

  return jsonSuccess({ jobs });
}
*/

// ============================================================================
// Example: Accessing resources by ID
// ============================================================================

/*
// BEFORE: Manual access check
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const { id } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .single();

  if (!job) return jsonError("Job not found", 404);

  // ❌ Manual tenant check - easy to forget!
  if (job.organisation_id !== ctx.organisationId && ctx.role !== "super_admin") {
    return jsonError("Forbidden", 403);
  }

  // ❌ What about agency users? Need to check client orgs manually
  if (ctx.role === "agency") {
    // ... more manual code
  }

  return jsonSuccess({ job });
}

// AFTER: Automatic access assertion
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const { id } = await params;
  const db = await getTenantScopedClient(ctx);

  // ✅ Automatic access check - throws ForbiddenError if not accessible
  await db.assertJobAccess(id);

  const { data: job } = await db.jobs()
    .select("*")
    .eq("id", id)
    .single();

  if (!job) return jsonError("Job not found", 404);

  return jsonSuccess({ job });
}
*/

// ============================================================================
// Example: Complex queries with joins
// ============================================================================

/*
// BEFORE: Manual tenant filtering on joined tables
export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const supabase = await createSupabaseServerClient();

  // ❌ Complex manual filtering - easy to get wrong!
  const { data: applications } = await supabase
    .from("applications")
    .select("*, jobs!inner(organisation_id)")
    .eq("jobs.organisation_id", ctx.organisationId);

  return jsonSuccess({ applications });
}

// AFTER: Automatic tenant filtering
export async function GET() {
  const ctx = await getAuthContext();
  if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

  const db = await getTenantScopedClient(ctx);

  // ✅ Automatic filtering via join - handles all edge cases
  const { data: applications } = await db.applications()
    .select("*, jobs(id, title)");

  return jsonSuccess({ applications });
}
*/
