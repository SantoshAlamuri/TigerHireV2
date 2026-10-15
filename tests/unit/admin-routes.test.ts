import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  superAdminCtx,
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  createMockQueryBuilder,
} from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...a: unknown[]) => mockServerFrom(...a) }),
}));

const mockAdminFrom = vi.fn();
const mockAdminListUsers = vi.fn();
const mockAdminUpdateUserById = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...a: unknown[]) => mockAdminFrom(...a),
    auth: {
      admin: {
        listUsers: (...a: unknown[]) => mockAdminListUsers(...a),
        updateUserById: (...a: unknown[]) => mockAdminUpdateUserById(...a),
      },
    },
  }),
}));

const mockFindPendingInvite = vi.fn();
const mockCreateInvite = vi.fn().mockResolvedValue(undefined);
const mockGetByIdOrg = vi.fn().mockResolvedValue({ id: "org-1", name: "Acme" });
vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    findPendingInvite: (...args: unknown[]) => mockFindPendingInvite(...args),
    createInvite: (...args: unknown[]) => mockCreateInvite(...args),
    getById: (...args: unknown[]) => mockGetByIdOrg(...args),
  },
}));

const mockProfileGetById = vi.fn().mockResolvedValue({ full_name: "Admin" });
vi.mock("@/lib/repositories/ProfileRepository", () => ({
  ProfileRepository: {
    getById: (...args: unknown[]) => mockProfileGetById(...args),
  },
}));

const mockSendInviteEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/resend", () => ({
  sendInviteEmail: (...args: unknown[]) => mockSendInviteEmail(...args),
}));

const mockClearFlagCache = vi.fn();
const mockInvalidateFeatureFlagCache = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/feature-flags", () => ({
  clearFlagCache: () => mockClearFlagCache(),
  invalidateFeatureFlagCache: (...args: unknown[]) => mockInvalidateFeatureFlagCache(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// GET /api/admin/users
// ---------------------------------------------------------------------------
describe("GET /api/admin/users", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
    mockAdminListUsers.mockReset();
    mockAdminListUsers.mockResolvedValue({ data: { users: [] }, error: null });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 200 with paginated users", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: [{ id: "u1", full_name: "Alice" }],
      count: 1,
    });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: [{ id: "u1", full_name: "Alice" }],
        error: null,
        count: 1,
      }),
    );
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users?offset=0&limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toBeDefined();
    expect(body.pagination).toBeDefined();
  });

  it("returns 400 for invalid offset", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users?offset=-1&limit=10");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns paginated users when no filters are provided", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: [{ id: "u1", full_name: "Alice" }],
      count: 1,
    });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: [{ id: "u1", full_name: "Alice" }],
        error: null,
        count: 1,
      }),
    );
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users).toHaveLength(1);
    expect(body.pagination).toBeDefined();
    expect(body.requiresFilter).toBeUndefined();
  });

  it("enriches listed users with emails from auth.users", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: [{ id: "u1", full_name: "Alice" }],
      count: 1,
    });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: [{ id: "u1", full_name: "Alice" }],
        error: null,
        count: 1,
      }),
    );
    mockServerFrom.mockReturnValue(builder);
    mockAdminListUsers.mockResolvedValue({
      data: { users: [{ id: "u1", email: "alice@example.com" }] },
      error: null,
    });

    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users[0].email).toBe("alice@example.com");
  });

  it("still lists users when the email lookup fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: [{ id: "u1", full_name: "Alice" }],
      count: 1,
    });
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: [{ id: "u1", full_name: "Alice" }],
        error: null,
        count: 1,
      }),
    );
    mockServerFrom.mockReturnValue(builder);
    mockAdminListUsers.mockRejectedValue(new Error("auth api down"));

    const { GET } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.users[0].email).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/users
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/users", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAdminFrom.mockReset();
    mockAdminUpdateUserById.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", role: "recruiter" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", role: "recruiter" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 when userId or role missing", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid role", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", role: "invalid_role" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful role update", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: { id: "u1", role: "recruiter" },
    });
    mockAdminFrom.mockReturnValue(builder);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", role: "recruiter" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeDefined();
  });

  it("returns 500 when update fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({ error: { message: "db error" } });
    mockAdminFrom.mockReturnValue(builder);

    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", role: "recruiter" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });

  it("returns 200 when updating name, email, and organisation", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({
      data: { id: "u1", full_name: "New Name", organisation_id: "org-1" },
    });
    mockAdminFrom.mockReturnValue(builder);
    mockAdminUpdateUserById.mockResolvedValue({ data: { user: { id: "u1" } }, error: null });

    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "u1",
        fullName: "New Name",
        email: "new@example.com",
        organisationId: "0b9f9f8e-7c1d-4b6a-9a2e-1c3d5e7f9a0b",
      }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith("u1", {
      email: "new@example.com",
      email_confirm: true,
    });
  });

  it("returns 400 when the auth email update fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder({ data: { id: "u1" } });
    mockAdminFrom.mockReturnValue(builder);
    mockAdminUpdateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: "Email address already registered" },
    });

    const { PATCH } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: "u1", email: "taken@example.com" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("already registered");
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users/reset-password
// ---------------------------------------------------------------------------
describe("POST /api/admin/users/reset-password", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAdminListUsers.mockReset();
    mockAdminUpdateUserById.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/users/reset-password/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", newPassword: "password123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/admin/users/reset-password/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", newPassword: "password123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid payload", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/users/reset-password/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "invalid", newPassword: "short" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 404 when user is not found", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockAdminListUsers.mockResolvedValue({
      data: { users: [{ id: "u-1", email: "another@test.com" }] },
      error: null,
    });

    const { POST } = await import("@/app/api/admin/users/reset-password/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", newPassword: "password123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 200 on successful password reset", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockAdminListUsers.mockResolvedValue({
      data: { users: [{ id: "user-1", email: "user@test.com" }] },
      error: null,
    });
    mockAdminUpdateUserById.mockResolvedValue({ error: null });

    const { POST } = await import("@/app/api/admin/users/reset-password/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "user@test.com", newPassword: "password123" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe("user-1");
    expect(mockAdminUpdateUserById).toHaveBeenCalledWith("user-1", {
      password: "password123",
      email_confirm: true,
    });
  });
});

// ---------------------------------------------------------------------------
// POST /api/admin/users (invite)
// ---------------------------------------------------------------------------
describe("POST /api/admin/users", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFindPendingInvite.mockReset();
    mockCreateInvite.mockClear();
    mockSendInviteEmail.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 for invalid body", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "bad" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 409 when invite already pending", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockFindPendingInvite.mockResolvedValue({ id: "existing" });

    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "test@test.com",
        fullName: "Test User",
        role: "recruiter",
        organisationId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("returns 201 on successful invite", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockFindPendingInvite.mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@test.com",
        fullName: "New User",
        role: "recruiter",
        organisationId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.message).toBe("Invite sent");
    expect(body.email).toBe("new@test.com");
    expect(mockCreateInvite).toHaveBeenCalledOnce();
  });

  it("still creates invite even if email send fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockFindPendingInvite.mockResolvedValue(null);
    mockSendInviteEmail.mockRejectedValueOnce(new Error("email fail"));

    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "new@test.com",
        fullName: "New User",
        role: "employee",
        organisationId: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCreateInvite).toHaveBeenCalledOnce();
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /api/admin/feature-flags
// ---------------------------------------------------------------------------
describe("GET /api/admin/feature-flags", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/feature-flags/route");
    const res = await GET();
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/admin/feature-flags/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with flags", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder();
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({
        data: [
          {
            key: "beta",
            enabled: true,
            description: "Beta",
            updated_at: "2025-01-01",
          },
        ],
        error: null,
      }),
    );
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/admin/feature-flags/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.flags).toBeDefined();
  });

  it("returns 500 when query fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder();
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ data: null, error: { message: "fail" } }),
    );
    mockServerFrom.mockReturnValue(builder);

    const { GET } = await import("@/app/api/admin/feature-flags/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/admin/feature-flags
// ---------------------------------------------------------------------------
describe("PATCH /api/admin/feature-flags", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockServerFrom.mockReset();
    mockClearFlagCache.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "beta", enabled: true }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super_admin", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "beta", enabled: true }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when body is missing key or enabled", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "beta" }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 on successful flag update and clears cache", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder();
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) => resolve({ error: null }));
    mockServerFrom.mockReturnValue(builder);

    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "beta", enabled: false }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.key).toBe("beta");
    expect(body.enabled).toBe(false);
    expect(mockClearFlagCache).toHaveBeenCalledOnce();
  });

  it("returns 500 when update fails", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const builder = createMockQueryBuilder();
    (builder as any).then = vi.fn((resolve: (v: unknown) => void) =>
      resolve({ error: { message: "fail" } }),
    );
    mockServerFrom.mockReturnValue(builder);

    const { PATCH } = await import("@/app/api/admin/feature-flags/route");
    const req = new NextRequest("http://localhost:3000/api/admin/feature-flags", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "beta", enabled: true }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(500);
  });
});
