import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockFromServer = vi.fn();
const mockFromAdmin = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => ({ body: await request.json(), errorResponse: null }),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleZodError: () => new Response(JSON.stringify({ error: "invalid" }), { status: 422 }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockFromServer(...args) }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: (...args: unknown[]) => mockFromAdmin(...args) }),
}));

vi.mock("@/lib/repositories/ProfileRepository", () => ({
  ProfileRepository: { getById: () => Promise.resolve({ full_name: "Admin User" }) },
}));

vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getById: () => Promise.resolve({ id: "org-1", name: "Acme" }),
    getPendingInvites: () => Promise.resolve([]),
    createInvite: () => Promise.resolve(undefined),
    findPendingInvite: () => Promise.resolve(null),
  },
}));

vi.mock("@/lib/services/resend", () => ({ sendInviteEmail: () => Promise.resolve(undefined) }));
vi.mock("@/lib/redis/auth-profile-cache", () => ({
  deleteCachedAuthProfile: () => Promise.resolve(),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("POST /api/admin/users bulk csv", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFromServer.mockReset();
    mockFromAdmin.mockReset();
  });

  it("accepts bulk CSV payload and returns summary", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "admin-1",
      role: "super_admin",
      organisationId: "org-1",
    });

    const { POST } = await import("@/app/api/admin/users/route");
    const req = new NextRequest("http://localhost:3000/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organisationId: "00000000-0000-4000-8000-000000000001",
        csv: "email,role,full_name\njane@example.com,recruiter,Jane Doe",
        dryRun: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.totalRows).toBe(1);
    expect(body.summary.rejected).toBe(0);
  });
});
