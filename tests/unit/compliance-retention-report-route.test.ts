import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

describe("GET /api/compliance/retention-report", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("forbids org-scoped leadership (platform-wide counts, super_admin only)", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
      role: "leadership",
    });
    const { GET } = await import("@/app/api/compliance/retention-report/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns report for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      organisationId: "org-1",
      role: "super_admin",
    });

    const pendingBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 2 }),
    };
    const completedBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 4 }),
    };
    const deletionsBuilder = {
      select: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ count: 7 }),
    };

    let call = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "erasure_requests") {
        call += 1;
        return call === 1 ? pendingBuilder : completedBuilder;
      }
      if (table === "retention_deletions") return deletionsBuilder;
      return null;
    });

    const { GET } = await import("@/app/api/compliance/retention-report/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendingRequests).toBe(2);
    expect(body.completedRequests).toBe(4);
    expect(body.deletionsLast30d).toBe(7);
  });
});
