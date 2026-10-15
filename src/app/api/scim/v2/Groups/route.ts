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

export async function GET(request: NextRequest) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");

  const admin = createSupabaseAdmin();
  const organisationIdFilter = auth.organisationId as string;

  let query = admin
    .from("azure_group_role_mappings")
    .select("id, organisation_id, azure_group_id, tigerhire_role")
    .order("created_at", { ascending: false });
  if (organisationIdFilter) query = query.eq("organisation_id", organisationIdFilter);
  const { data } = await query.limit(200);

  const resources = (data ?? []).map((row) => ({
    id: row.id,
    displayName: row.azure_group_id,
    externalId: row.azure_group_id,
    members: [],
    roles: [{ value: row.tigerhire_role }],
    meta: { resourceType: "Group" },
  }));

  return NextResponse.json({
    totalResults: resources.length,
    startIndex: 1,
    itemsPerPage: resources.length,
    Resources: resources,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
  });
}

export async function POST(request: NextRequest) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return authError(auth.status, auth.error ?? "Unauthorized");
  const organisationIdFilter = auth.organisationId as string;

  const parsed = await parseScimJson<{
    displayName?: string;
    externalId?: string;
    roles?: Array<{ value?: string }>;
  }>(request);
  if (parsed.error || !parsed.body) return parsed.error ?? authError(400, "Invalid JSON body");
  const body = parsed.body;
  const groupId = body.externalId ?? body.displayName;
  const role = body.roles?.[0]?.value;
  if (!groupId || !role) {
    return NextResponse.json(
      { detail: "externalId/displayName and role are required" },
      { status: 400 },
    );
  }
  // Never allow a group->role mapping to grant a platform/elevated role.
  if (!isScimAssignableRole(role)) {
    return authError(400, "Invalid role value");
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("azure_group_role_mappings")
    .insert({
      organisation_id: organisationIdFilter,
      azure_group_id: groupId,
      tigerhire_role: role,
    })
    .select("id, organisation_id, azure_group_id, tigerhire_role")
    .single();

  if (error || !data) {
    return NextResponse.json({ detail: "Failed to create group mapping" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: data.id,
      displayName: data.azure_group_id,
      externalId: data.azure_group_id,
      members: [],
      roles: [{ value: data.tigerhire_role }],
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:Group"],
    },
    { status: 201 },
  );
}
