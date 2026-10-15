import { describe, it, expect, vi, beforeEach } from "vitest";
import { candidateCtx, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
  handleApiError: (err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockGetMyReferrals = vi.fn();
vi.mock("@/lib/services/EmployeeService", () => ({
  EmployeeService: {
    getMyReferrals: (...args: unknown[]) => mockGetMyReferrals(...args),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const employeeCtx = {
  userId: "user-emp-1",
  role: "employee",
  organisationId: "org-1",
};

describe("GET /api/employees/my-referrals", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetMyReferrals.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for recruiter role", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 200 with referral list", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetMyReferrals.mockResolvedValue([
      { id: "ref-1", candidate_name: "Alice", status: "pending" },
      { id: "ref-2", candidate_name: "Bob", status: "accepted" },
    ]);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referrals).toHaveLength(2);
    expect(body.referrals[0].id).toBe("ref-1");
    expect(body.referrals[1].id).toBe("ref-2");
  });

  it("returns 200 with empty array when no referrals", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetMyReferrals.mockResolvedValue([]);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referrals).toEqual([]);
  });

  it("returns 500 on DB error", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetMyReferrals.mockRejectedValueOnce(new Error("database connection lost"));
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("passes userId to EmployeeService.getMyReferrals", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetMyReferrals.mockResolvedValue([]);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    await GET();
    expect(mockGetMyReferrals).toHaveBeenCalledWith(expect.anything(), employeeCtx.userId);
  });
});
