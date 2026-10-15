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

const mockGetOpenPositions = vi.fn();
vi.mock("@/lib/services/EmployeeService", () => ({
  EmployeeService: {
    getOpenPositions: (...args: unknown[]) => mockGetOpenPositions(...args),
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

describe("GET /api/employees/open-positions", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOpenPositions.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when employee has no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...employeeCtx,
      organisationId: null,
    });
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No company");
  });

  it("returns 200 with open positions", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetOpenPositions.mockResolvedValue([
      { id: "job-1", title: "Software Engineer", status: "open" },
      { id: "job-2", title: "Product Manager", status: "open" },
    ]);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positions).toHaveLength(2);
    expect(body.positions[0].title).toBe("Software Engineer");
    expect(body.positions[1].title).toBe("Product Manager");
  });

  it("returns 200 with empty array when no open positions", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetOpenPositions.mockResolvedValue([]);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positions).toEqual([]);
  });

  it("returns 500 on DB error", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetOpenPositions.mockRejectedValueOnce(new Error("connection timeout"));
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("passes organisationId to EmployeeService.getOpenPositions", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetOpenPositions.mockResolvedValue([]);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    await GET();
    expect(mockGetOpenPositions).toHaveBeenCalledWith(
      expect.anything(),
      employeeCtx.organisationId,
    );
  });
});
