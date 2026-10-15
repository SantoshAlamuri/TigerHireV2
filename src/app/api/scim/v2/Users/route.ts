import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { requireScimContext, logScimEvent } from "@/lib/security/scim";
import { isScimAssignableRole } from "@/types/database";

function scimErrorResponse(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

function extractFilterValue(filter: string | null): string | null {
  if (!filter) return null;
  const emailEq = filter.match(/email eq \"([^\"]+)\"/i)?.[1];
  if (emailEq) return emailEq;
  const userNameEq = filter.match(/userName eq \"([^\"]+)\"/i)?.[1];
  if (userNameEq) return userNameEq;
  return null;
}

async function parseScimJson<T>(
  request: NextRequest,
): Promise<{ body: T | null; error: NextResponse | null }> {
  try {
    const raw = await request.text();
    const body = JSON.parse(raw) as T;
    return { body, error: null };
  } catch {
    return { body: null, error: scimErrorResponse(400, "Invalid JSON body") };
  }
}

export async function GET(request: NextRequest) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return scimErrorResponse(auth.status, auth.error ?? "Unauthorized");

  const admin = createSupabaseAdmin();
  const filter = new URL(request.url).searchParams.get("filter");
  const filterValue = extractFilterValue(filter);
  const organisationIdFilter = auth.organisationId as string;

  let query = admin
    .from("profiles")
    .select("id, full_name, role, organisation_id, azure_oid, is_active");
  if (organisationIdFilter) {
    query = query.eq("organisation_id", organisationIdFilter);
  }

  if (filterValue) {
    if (filterValue.includes("@")) {
      const usersRes = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const matched = usersRes.data?.users?.find(
        (user) => user.email?.toLowerCase() === filterValue.toLowerCase(),
      );
      if (!matched) {
        return NextResponse.json({
          totalResults: 0,
          startIndex: 1,
          itemsPerPage: 0,
          Resources: [],
          schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        });
      }
      query = query.eq("id", matched.id);
    } else {
      query = query.or(`azure_oid.eq.${filterValue},id.eq.${filterValue}`);
    }
  }

  const { data: profiles } = await query.limit(100);
  const users = (profiles ?? []).map((profile) => ({
    id: profile.id,
    userName: profile.azure_oid ?? profile.id,
    externalId: profile.azure_oid ?? profile.id,
    active: Boolean(profile.is_active),
    name: { formatted: profile.full_name ?? "" },
    roles: [{ value: profile.role }],
    meta: { resourceType: "User" },
  }));

  return NextResponse.json({
    totalResults: users.length,
    startIndex: 1,
    itemsPerPage: users.length,
    Resources: users,
    schemas: ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
  });
}

export async function POST(request: NextRequest) {
  const auth = requireScimContext(request, { requireOrganisationHeader: true });
  if (!auth.ok) return scimErrorResponse(auth.status, auth.error ?? "Unauthorized");

  const parsed = await parseScimJson<{
    userName?: string;
    externalId?: string;
    active?: boolean;
    name?: { formatted?: string };
    roles?: Array<{ value?: string }>;
    enterpriseUser?: { organization?: string };
  }>(request);
  if (parsed.error || !parsed.body)
    return parsed.error ?? scimErrorResponse(400, "Invalid JSON body");
  const body = parsed.body;
  const role = body.roles?.[0]?.value ?? "employee";
  // Never allow automated provisioning to assign a platform/elevated role.
  if (!isScimAssignableRole(role)) {
    return scimErrorResponse(400, "Invalid role value");
  }
  const organisationId = auth.organisationId as string;
  const email = body.userName ?? `${body.externalId ?? `scim-${Date.now()}`}@scim.local`;

  const admin = createSupabaseAdmin();
  const { data: createdUser, error: authError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { source: "scim", externalId: body.externalId ?? null },
  });
  if (authError || !createdUser.user) {
    return NextResponse.json({ detail: "Failed to create auth user" }, { status: 500 });
  }

  const { data: inserted, error } = await admin
    .from("profiles")
    .insert({
      id: createdUser.user.id,
      role,
      full_name: body.name?.formatted ?? null,
      organisation_id: organisationId,
      azure_oid: body.externalId ?? null,
      is_active: body.active ?? true,
    })
    .select("id, role, organisation_id, azure_oid, is_active")
    .single();

  await logScimEvent(
    "user.created",
    body as Record<string, unknown>,
    organisationId,
    body.externalId ?? null,
  );

  if (error || !inserted) {
    return NextResponse.json({ detail: "Failed to provision user" }, { status: 500 });
  }

  return NextResponse.json(
    {
      id: inserted.id,
      userName: email,
      externalId: inserted.azure_oid ?? inserted.id,
      active: inserted.is_active,
      roles: [{ value: inserted.role }],
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    },
    { status: 201 },
  );
}
