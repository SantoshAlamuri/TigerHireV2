import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

const mockCreateSupabaseAdmin = vi.fn();
const mockRequireScimContext = vi.fn();
const mockLogScimEvent = vi.fn();
const mockDeleteCachedAuthProfile = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/scim", () => ({
  requireScimContext: (...args: unknown[]) => mockRequireScimContext(...args),
  logScimEvent: (...args: unknown[]) => mockLogScimEvent(...args),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: (...args: unknown[]) => mockDeleteCachedAuthProfile(...args),
}));

function buildAdmin(builders: Record<string, ReturnType<typeof createMockQueryBuilder>>) {
  return {
    from: vi.fn((table: string) => builders[table]),
    auth: {
      admin: {
        createUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-new", email: "new@example.com" } },
          error: null,
        }),
        listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
      },
    },
  };
}

describe("SCIM users routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireScimContext.mockReturnValue({
      ok: true,
      status: 200,
      organisationId: "org-1",
    });
    mockLogScimEvent.mockResolvedValue(undefined);
    mockDeleteCachedAuthProfile.mockResolvedValue(undefined);
  });

  it("returns 401 on GET when bearer is invalid", async () => {
    mockRequireScimContext.mockReturnValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { GET } = await import("@/app/api/scim/v2/Users/route");
    const res = await GET(new NextRequest("http://localhost/api/scim/v2/Users"));
    expect(res.status).toBe(401);
  });

  it("GET /api/scim/v2/Users filters by x-scim-organisation-id header", async () => {
    const profilesBuilder = createMockQueryBuilder({
      data: [
        {
          id: "u1",
          role: "recruiter",
          full_name: "Jane",
          azure_oid: "aad-1",
          is_active: true,
          organisation_id: "org-1",
        },
      ],
    });
    const admin = buildAdmin({ profiles: profilesBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { GET } = await import("@/app/api/scim/v2/Users/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users", {
      headers: { "x-scim-organisation-id": "org-1" },
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(profilesBuilder.eq).toHaveBeenCalledWith("organisation_id", "org-1");
  });

  it("POST /api/scim/v2/Users provisions auth user and profile", async () => {
    const profilesBuilder = createMockQueryBuilder({
      data: {
        id: "user-new",
        role: "recruiter",
        organisation_id: "org-1",
        azure_oid: "aad-1",
        is_active: true,
      },
    });
    const admin = buildAdmin({ profiles: profilesBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/scim/v2/Users/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scim-organisation-id": "org-1" },
      body: JSON.stringify({
        userName: "new@example.com",
        externalId: "aad-1",
        active: true,
        name: { formatted: "New User" },
        roles: [{ value: "recruiter" }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockLogScimEvent).toHaveBeenCalledWith(
      "user.created",
      expect.any(Object),
      "org-1",
      "aad-1",
    );
  });

  it("POST /api/scim/v2/Users returns 400 for malformed JSON", async () => {
    const profilesBuilder = createMockQueryBuilder({ data: null, error: null });
    const admin = buildAdmin({ profiles: profilesBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/scim/v2/Users/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-scim-organisation-id": "org-1" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("PATCH /api/scim/v2/Users/[id] returns 400 with unsupported operations", async () => {
    const admin = buildAdmin({ profiles: createMockQueryBuilder() });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { PATCH } = await import("@/app/api/scim/v2/Users/[id]/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-scim-organisation-id": "org-1" },
      body: JSON.stringify({
        Operations: [{ op: "replace", path: "emails", value: "x@y.com" }],
      }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(400);
  });

  it("PATCH /api/scim/v2/Users/[id] returns 400 for malformed JSON", async () => {
    const admin = buildAdmin({ profiles: createMockQueryBuilder() });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { PATCH } = await import("@/app/api/scim/v2/Users/[id]/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-scim-organisation-id": "org-1" },
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(400);
  });

  it("DELETE /api/scim/v2/Users/[id] deactivates user and clears profile cache", async () => {
    const profilesBuilder = createMockQueryBuilder({
      data: { organisation_id: "org-1" },
    });
    const admin = buildAdmin({ profiles: profilesBuilder });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { DELETE } = await import("@/app/api/scim/v2/Users/[id]/route");
    const req = new NextRequest("http://localhost/api/scim/v2/Users/u1", {
      method: "DELETE",
      headers: { "x-scim-organisation-id": "org-1" },
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "u1" }) });
    expect(res.status).toBe(204);
    expect(mockDeleteCachedAuthProfile).toHaveBeenCalledWith("u1");
    expect(mockLogScimEvent).toHaveBeenCalledWith("user.deactivated", { id: "u1" }, "org-1", "u1");
  });
});
