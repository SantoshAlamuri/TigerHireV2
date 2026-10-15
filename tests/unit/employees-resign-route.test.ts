import { describe, it, expect, vi, beforeEach } from "vitest";
import { companyAdminCtx, recruiterCtx, candidateCtx, superAdminCtx } from "../helpers";

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
  handleApiError: (err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockDeclareResignation = vi.fn().mockResolvedValue({ id: "resign-1", status: "pending" });
vi.mock("@/lib/services/EmployeeService", () => ({
  EmployeeService: {
    declareResignation: (...args: unknown[]) => mockDeclareResignation(...args),
  },
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const employeeCtx = {
  userId: "user-emp-1",
  role: "employee",
  organisationId: "org-1",
};

// ---------------------------------------------------------------------------
// POST /api/employees/resign
// ---------------------------------------------------------------------------
describe("POST /api/employees/resign", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockDeclareResignation.mockClear();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 201 when resignation is recorded with candidateId", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: "cand-1" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.resignation).toBeDefined();
    expect(body.message).toContain("48-hour hold");
  });

  it("returns 201 when candidate profile found via user_id lookup", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: "cand-auto" }, error: null }),
        }),
      }),
    });
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
  });

  it("returns 400 when no candidate profile found and no candidateId given", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    });
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No candidate profile");
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockDeclareResignation.mockRejectedValueOnce(new Error("db fail"));
    const { POST } = await import("@/app/api/employees/resign/route");
    const req = new Request("http://localhost:3000/api/employees/resign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateId: "cand-1" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/employees/resign
// ---------------------------------------------------------------------------
describe("GET /api/employees/resign", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles (employee)", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for recruiter role", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin has no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...companyAdminCtx,
      organisationId: null,
    });
    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns 200 with resignation list for leadership", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const mockBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({
          data: [
            {
              id: "resign-1",
              candidate_id: "cand-1",
              declared_by: "user-emp-1",
              created_at: "2025-01-01T00:00:00Z",
              profile_unlock_scheduled_at: futureDate,
              disputed: false,
              candidates: { id: "cand-1", employer_company_id: "org-1" },
            },
          ],
          error: null,
        }),
      ),
    };
    mockFrom.mockReturnValue(mockBuilder);

    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resignations).toHaveLength(1);
    expect(body.resignations[0].id).toBe("resign-1");
    expect(body.resignations[0].candidate_id).toBe("cand-1");
  });

  it("returns 200 with empty list when no resignations", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);

    const mockBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
    };
    mockFrom.mockReturnValue(mockBuilder);

    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resignations).toEqual([]);
  });

  it("returns 200 for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({ ...superAdminCtx, organisationId: "org-1" });

    const mockBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
    };
    mockFrom.mockReturnValue(mockBuilder);

    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns 500 on DB error", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);

    const mockBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { message: "query failed" } }),
      ),
    };
    mockFrom.mockReturnValue(mockBuilder);

    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Failed to fetch resignations");
  });

  it("filters out resignations from other organisations", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);

    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const mockBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (v: unknown) => void) =>
        resolve({
          data: [
            {
              id: "resign-own",
              candidate_id: "cand-1",
              declared_by: "user-1",
              created_at: "2025-01-01T00:00:00Z",
              profile_unlock_scheduled_at: futureDate,
              disputed: false,
              candidates: { id: "cand-1", employer_company_id: "org-1" },
            },
            {
              id: "resign-other",
              candidate_id: "cand-2",
              declared_by: "user-2",
              created_at: "2025-01-01T00:00:00Z",
              profile_unlock_scheduled_at: futureDate,
              disputed: false,
              candidates: { id: "cand-2", employer_company_id: "org-other" },
            },
          ],
          error: null,
        }),
      ),
    };
    mockFrom.mockReturnValue(mockBuilder);

    const { GET } = await import("@/app/api/employees/resign/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resignations).toHaveLength(1);
    expect(body.resignations[0].id).toBe("resign-own");
  });
});
