import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx } from "../helpers";

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
  jsonSuccess: (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
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

const mockGetMembers = vi.fn();
const mockGetPendingInvites = vi.fn();
const mockFindPendingInvite = vi.fn();
const mockCreateInvite = vi.fn();
const mockGetById = vi.fn();
vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getMembers: (...args: unknown[]) => mockGetMembers(...args),
    getPendingInvites: (...args: unknown[]) => mockGetPendingInvites(...args),
    findPendingInvite: (...args: unknown[]) => mockFindPendingInvite(...args),
    createInvite: (...args: unknown[]) => mockCreateInvite(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/repositories/ProfileRepository", () => ({
  ProfileRepository: { getById: vi.fn().mockResolvedValue({ full_name: "User" }) },
}));

vi.mock("@/lib/services/resend", () => ({
  sendInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn(async () => ({ allowed: true })),
  RATE_LIMIT_PRESETS: { default: { limit: 30, windowSecs: 60 } },
}));

describe("GET /api/organisations/members", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetMembers.mockResolvedValue([]);
    mockGetPendingInvites.mockResolvedValue([]);
    mockFindPendingInvite.mockResolvedValue(null);
    mockCreateInvite.mockResolvedValue(undefined);
    mockGetById.mockResolvedValue({ id: "org-1", name: "Acme" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when user has no organisationId", async () => {
    mockGetAuthContext.mockResolvedValue({ ...recruiterCtx, organisationId: null });
    const { GET } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 200 with members and pendingInvites", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetMembers.mockResolvedValue([{ id: "u1", email: "u@test.com" }]);
    mockGetPendingInvites.mockResolvedValue([]);
    const { GET } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.members).toBeDefined();
    expect(body.pendingInvites).toEqual([]);
  });
});

describe("POST /api/organisations/members", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "recruiter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@test.com", role: "recruiter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns bulk import summary for CSV payload", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        csv: "email,role,full_name\nalice@example.com,recruiter,Alice\nbob@example.com,interviewer,Bob",
        dryRun: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.import.totalRows).toBe(2);
    expect(body.import.accepted).toBe(2);
    expect(body.import.rejected).toBe(0);
  });

  it("allows recruiter role to send a single invite", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFindPendingInvite.mockResolvedValue(null);

    const { POST } = await import("@/app/api/organisations/members/route");
    const req = new NextRequest("http://localhost:3000/api/organisations/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new-hire@example.com", role: "recruiter" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
