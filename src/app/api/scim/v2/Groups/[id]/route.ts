import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireScimContext } from "@/lib/security/scim";
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
  const organisationIdFilter = auth.organisationId as string;
  const admin = createSupabaseAdmin();
  let query = admin
    .from("azure_group_role_mappings")
    .select("id, organisation_id, azure_group_id, tigerhire_role")
    .eq("id", id);
  if (organisationIdFilter) query = query.eq("organisation_id", organisationIdFilter);
  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ detail: "Failed to fetch group mapping" }, { status: 500 });
  if (!data) return NextResponse.json({ detail: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: data.id,
    displayName: data.azure_group_id,
    externalId: data.azure_group_id,
    members: [],
    roles: [{ value: data.tigerhire_role }],
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const { id } = await params;
  const organisationIdFilter = auth.organisationId as string;
  const parsed = await parseScimJson<{
    Operations?: Array<{
      path?: string;
      value?: unknown;
    }>;
  }>(request);
  if (parsed.error || !parsed.body) return parsed.error ?? authError(400, "Invalid JSON body");
  const body = parsed.body;

  const update: Record<string, unknown> = {};
  for (const operation of body.Operations ?? []) {
    if (operation.path === "displayName" || operation.path === "externalId") {
      update.azure_group_id = String(operation.value ?? "");
    }
    if (operation.path === "roles" && Array.isArray(operation.value)) {
      const roleValue = (operation.value[0] as { value?: string } | undefined)?.value;
      if (roleValue) {
        // Never allow a group->role mapping to grant a platform/elevated role.
        if (!isScimAssignableRole(roleValue)) {
          return authError(400, "Invalid role value");
        }
        update.tigerhire_role = roleValue;
      }
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ detail: "No supported operation" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  let query = admin.from("azure_group_role_mappings").update(update).eq("id", id);
  if (organisationIdFilter) query = query.eq("organisation_id", organisationIdFilter);
  const { data, error } = await query.select("id, azure_group_id, tigerhire_role").maybeSingle();
  if (error)
    return NextResponse.json({ detail: "Failed to update group mapping" }, { status: 500 });
  if (!data) return NextResponse.json({ detail: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: data.id,
    displayName: data.azure_group_id,
    externalId: data.azure_group_id,
    members: [],
    roles: [{ value: data.tigerhire_role }],
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const { id } = await params;
  const organisationIdFilter = auth.organisationId as string;
  const admin = createSupabaseAdmin();
  let query = admin.from("azure_group_role_mappings").delete().eq("id", id);
  if (organisationIdFilter) query = query.eq("organisation_id", organisationIdFilter);
  const { error } = await query;
  if (error)
    return NextResponse.json({ detail: "Failed to delete group mapping" }, { status: 500 });
  return NextResponse.json({}, { status: 204 });
}
