import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

const mockCreateSupabaseAdmin = vi.fn();
const mockDeleteCachedAuthProfile = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: (...args: unknown[]) => mockDeleteCachedAuthProfile(...args),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    parseJsonBody: async (request: Request) => {
      try {
        const body = await request.json();
        return { body, errorResponse: null };
      } catch {
        return {
          body: null,
          errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
        };
      }
    },
    jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
    jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
    handleZodError: () => Response.json({ error: "Invalid request payload" }, { status: 422 }),
    handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
  };
});

describe("POST /api/auth/entra/sync", () => {
  const originalSecret = process.env.ENTRA_SYNC_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ENTRA_SYNC_SECRET = "test-secret";
    mockDeleteCachedAuthProfile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.ENTRA_SYNC_SECRET = originalSecret;
  });

  it("returns 401 for invalid bearer", async () => {
    const { POST } = await import("@/app/api/auth/entra/sync/route");
    const req = new NextRequest("http://localhost/api/auth/entra/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer wrong" },
      body: JSON.stringify({ users: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 422 when no users are provided", async () => {
    const { POST } = await import("@/app/api/auth/entra/sync/route");
    const req = new NextRequest("http://localhost/api/auth/entra/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer test-secret" },
      body: JSON.stringify({ users: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON payload", async () => {
    const { POST } = await import("@/app/api/auth/entra/sync/route");
    const req = new NextRequest("http://localhost/api/auth/entra/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer test-secret" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("processes users and returns processed/deactivated counts", async () => {
    const mappingsBuilder = createMockQueryBuilder({
      data: [{ tigerhire_role: "recruiter" }, { tigerhire_role: "hiring_manager" }],
    });
    const profilesBuilder = createMockQueryBuilder({ data: null, error: null });
    const employeeRolesBuilder = createMockQueryBuilder({ data: null, error: null });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "azure_group_role_mappings") return mappingsBuilder;
        if (table === "profiles") return profilesBuilder;
        if (table === "employee_roles") return employeeRolesBuilder;
        return createMockQueryBuilder();
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/auth/entra/sync/route");
    const req = new NextRequest("http://localhost/api/auth/entra/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json", authorization: "Bearer test-secret" },
      body: JSON.stringify({
        users: [
          {
            userId: "u1",
            azureOid: "aad-1",
            organisationId: "org-1",
            active: true,
            groupIds: ["g1", "g2"],
          },
          {
            userId: "u2",
            azureOid: "aad-2",
            organisationId: "org-1",
            active: false,
            groupIds: ["g1"],
          },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.processed).toBe(2);
    expect(body.deactivated).toBe(1);
    expect(mockDeleteCachedAuthProfile).toHaveBeenCalledTimes(2);
  });
});
