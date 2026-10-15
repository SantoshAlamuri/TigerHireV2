import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireScimContext, logScimEvent } from "@/lib/security/scim";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { isScimAssignableRole } from "@/types/database";

function authError(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

async function parseScimJson<T>(
  request: NextRequest,
): Promise<{ body: T | null; error: NextResponse | null }> {
  try {
    const raw = await request.text();
    const body = JSON.parse(raw) as T;
    return { body, error: null };
  } catch {
    return { body: null, error: authError(400, "Invalid JSON body") };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const { id } = await params;
  const admin = createSupabaseAdmin();
  const organisationIdFilter = auth.organisationId as string;

  let query = admin
    .from("profiles")
    .select("id, role, full_name, azure_oid, is_active, organisation_id")
    .eq("id", id);
  if (organisationIdFilter) query = query.eq("organisation_id", organisationIdFilter);
  const { data: profile } = await query.single();
  if (!profile) return NextResponse.json({ detail: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: profile.id,
    userName: profile.azure_oid ?? profile.id,
    externalId: profile.azure_oid ?? profile.id,
    active: profile.is_active,
    name: { formatted: profile.full_name ?? "" },
    roles: [{ value: profile.role }],
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const { id } = await params;
  const organisationIdFilter = auth.organisationId as string;
  const parsed = await parseScimJson<{
    Operations?: Array<{
      op?: string;
      path?: string;
      value?: unknown;
    }>;
  }>(request);
  if (parsed.error || !parsed.body) return parsed.error ?? authError(400, "Invalid JSON body");
  const body = parsed.body;

  const update: Record<string, unknown> = {};
  for (const op of body.Operations ?? []) {
    if (op.path === "active") update.is_active = Boolean(op.value);
    if (op.path === "name.formatted") update.full_name = String(op.value ?? "");
    if (op.path === "roles" && Array.isArray(op.value)) {
      const role = (op.value[0] as { value?: string } | undefined)?.value;
      if (role) {
        // Never allow automated provisioning to assign a platform/elevated role.
        if (!isScimAssignableRole(role)) {
          return authError(400, "Invalid role value");
        }
        update.role = role;
      }
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ detail: "No supported operation" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  let updateQuery = admin.from("profiles").update(update).eq("id", id);
  if (organisationIdFilter) updateQuery = updateQuery.eq("organisation_id", organisationIdFilter);
  const { data, error } = await updateQuery.select("id, organisation_id").maybeSingle();
  if (error) return NextResponse.json({ detail: "Failed to update user" }, { status: 500 });
  if (!data) return NextResponse.json({ detail: "Not found" }, { status: 404 });

  await deleteCachedAuthProfile(id);
  await logScimEvent(
    "user.updated",
    body as Record<string, unknown>,
    (data as { organisation_id?: string | null }).organisation_id ?? null,
    id,
  );
  return new NextResponse(null, { status: 204 });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const { id } = await params;
  const admin = createSupabaseAdmin();
  const organisationIdFilter = auth.organisationId as string;
  let deactivateQuery = admin.from("profiles").update({ is_active: false }).eq("id", id);
  if (organisationIdFilter)
    deactivateQuery = deactivateQuery.eq("organisation_id", organisationIdFilter);
  const { data, error } = await deactivateQuery.select("organisation_id").maybeSingle();
  if (error) return NextResponse.json({ detail: "Failed to deactivate user" }, { status: 500 });
  if (!data) return NextResponse.json({ detail: "Not found" }, { status: 404 });
  await deleteCachedAuthProfile(id);
  await logScimEvent(
    "user.deactivated",
    { id },
    (data as { organisation_id?: string | null } | null)?.organisation_id ?? null,
    id,
  );
  return new NextResponse(null, { status: 204 });
}
