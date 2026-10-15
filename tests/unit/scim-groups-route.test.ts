import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

const mockAdminSupabase = createMockSupabase();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => mockAdminSupabase),
}));

const mockRequireScimContext = vi.fn();
vi.mock("@/lib/security/scim", () => ({
  requireScimContext: (request: Request) => mockRequireScimContext(request),
}));

describe("SCIM Groups routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireScimContext.mockReturnValue({
      ok: true,
      status: 200,
      organisationId: "org-1",
    });
  });

  it("returns 401 when bearer token is invalid", async () => {
    mockRequireScimContext.mockReturnValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { GET } = await import("@/app/api/scim/v2/Groups/route");
    const res = await GET(new Request("http://localhost/api/scim/v2/Groups") as never);
    expect(res.status).toBe(401);
  });

  it("filters group list by x-scim-organisation-id header", async () => {
    const groupsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "grp-1",
          organisation_id: "org-1",
          azure_group_id: "AAD-Engineering",
          tigerhire_role: "recruiter",
        },
      ],
    });
    const supabase = createMockSupabase({ azure_group_role_mappings: groupsBuilder });
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { GET } = await import("@/app/api/scim/v2/Groups/route");
    const req = new Request("http://localhost/api/scim/v2/Groups", {
      headers: { "x-scim-organisation-id": "org-1" },
    });
    const res = await GET(req as never);

    expect(res.status).toBe(200);
    expect(groupsBuilder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
    const body = await res.json();
    expect(body.Resources[0].displayName).toBe("AAD-Engineering");
  });

  it("requires tenant context for group POST", async () => {
    mockRequireScimContext.mockReturnValue({
      ok: false,
      status: 400,
      error: "Missing x-scim-organisation-id header",
    });
    const { POST } = await import("@/app/api/scim/v2/Groups/route");
    const req = new Request("http://localhost/api/scim/v2/Groups", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ externalId: "AAD-Eng", roles: [{ value: "recruiter" }] }),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON on group POST", async () => {
    const { POST } = await import("@/app/api/scim/v2/Groups/route");
    const req = new Request("http://localhost/api/scim/v2/Groups", {
      method: "POST",
      headers: { "content-type": "application/json", "x-scim-organisation-id": "org-1" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("returns 404 when scoped group id is not found", async () => {
    const groupBuilder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ azure_group_role_mappings: groupBuilder });
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { GET } = await import("@/app/api/scim/v2/Groups/[id]/route");
    const req = new Request("http://localhost/api/scim/v2/Groups/grp-404", {
      headers: { "x-scim-organisation-id": "org-1" },
    });
    const res = await GET(req as never, { params: Promise.resolve({ id: "grp-404" }) });
    expect(res.status).toBe(404);
  });

  it("returns 400 for malformed JSON on group PATCH", async () => {
    const groupBuilder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ azure_group_role_mappings: groupBuilder });
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { PATCH } = await import("@/app/api/scim/v2/Groups/[id]/route");
    const req = new Request("http://localhost/api/scim/v2/Groups/grp-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-scim-organisation-id": "org-1" },
      body: "not json",
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: "grp-1" }) });
    expect(res.status).toBe(400);
  });
});
