import { describe, it, expect, vi, beforeEach } from "vitest";
import { recruiterCtx, companyAdminCtx, superAdminCtx, candidateCtx } from "../helpers";

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

const mockRefer = vi.fn().mockResolvedValue({
  referral: { id: "ref-1" },
  whatsapp: { reached: true, via: "test", error: null },
});
const mockGetMyReferrals = vi.fn().mockResolvedValue([{ id: "ref-1" }]);
const mockGetOpenPositions = vi.fn().mockResolvedValue([{ id: "job-1", title: "Engineer" }]);
const mockDeclareResignation = vi.fn().mockResolvedValue({ id: "resign-1", status: "pending" });
const mockDisputeResignation = vi.fn().mockResolvedValue(undefined);
const mockAssertJobOwnership = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/services/EmployeeService", () => ({
  EmployeeService: {
    refer: (...args: unknown[]) => mockRefer(...args),
    getMyReferrals: (...args: unknown[]) => mockGetMyReferrals(...args),
    getOpenPositions: (...args: unknown[]) => mockGetOpenPositions(...args),
    declareResignation: (...args: unknown[]) => mockDeclareResignation(...args),
    disputeResignation: (...args: unknown[]) => mockDisputeResignation(...args),
  },
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/security/tenancy", () => ({
  assertJobOwnership: vi.fn().mockResolvedValue(undefined),
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/referrers/resolve-referrer-id", () => ({
  resolveReferrerIdForUser: vi.fn().mockResolvedValue("referrer-1"),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/security/tenancy", () => ({
  assertJobOwnership: (...args: unknown[]) => mockAssertJobOwnership(...args),
  ForbiddenError: class ForbiddenError extends Error {
    status = 403;
    constructor(msg: string) {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
}));

const employeeCtx = {
  userId: "user-emp-1",
  role: "employee",
  organisationId: "org-1",
};

// ---------------------------------------------------------------------------
// POST /api/employees/refer
// ---------------------------------------------------------------------------
describe("POST /api/employees/refer", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockRefer.mockClear();
    mockAssertJobOwnership.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 400 when employee has no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...employeeCtx,
      organisationId: null,
    });
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "+919876543210",
        candidate_name: "Jane Doe",
        job_id: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid body", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "bad",
        candidate_name: "",
        job_id: "not-uuid",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(422);
  });

  it("returns 201 on successful referral", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "+919876543210",
        candidate_name: "Jane Doe",
        job_id: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.referral).toBeDefined();
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockRefer.mockRejectedValueOnce(new Error("db fail"));
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "+919876543210",
        candidate_name: "Jane Doe",
        job_id: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/employees/my-referrals
// ---------------------------------------------------------------------------
describe("GET /api/employees/my-referrals", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetMyReferrals.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(403);
  }, 15000);

  it("returns 200 with referrals for employee", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.referrals).toEqual([{ id: "ref-1" }]);
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetMyReferrals.mockRejectedValueOnce(new Error("fail"));
    const { GET } = await import("@/app/api/employees/my-referrals/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// GET /api/employees/open-positions
// ---------------------------------------------------------------------------
describe("GET /api/employees/open-positions", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetOpenPositions.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(401);
  }, 15000);

  it("returns 403 for non-employee roles", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(403);
  }, 15000);

  it("returns 400 when employee has no organisation", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...employeeCtx,
      organisationId: null,
    });
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(400);
  });

  it("returns 200 with positions for employee", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.positions).toEqual([{ id: "job-1", title: "Engineer" }]);
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockGetOpenPositions.mockRejectedValueOnce(new Error("fail"));
    const { GET } = await import("@/app/api/employees/open-positions/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

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
  });

  it("returns 201 when candidateId is provided in body", async () => {
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
          single: vi.fn().mockResolvedValue({ data: { id: "cand-2" }, error: null }),
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

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    mockDeclareResignation.mockRejectedValueOnce(new Error("fail"));
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
// POST /api/employees/resign/dispute
// ---------------------------------------------------------------------------
describe("POST /api/employees/resign/dispute", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockDisputeResignation.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-admin roles", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resignationId: "r-1", reason: "contested" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 422 when resignationId is missing", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "contested" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(422);
  });

  it("returns 422 when reason is missing", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resignationId: "r-1" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(422);
  });

  it("returns 200 for leadership with valid body", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resignationId: "r-1",
        reason: "Employee still active",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toContain("disputed");
  });

  it("returns 200 for super_admin with valid body", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resignationId: "r-1", reason: "Under review" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 500 when service throws", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockDisputeResignation.mockRejectedValueOnce(new Error("fail"));
    const { POST } = await import("@/app/api/employees/resign/dispute/route");
    const req = new Request("http://localhost:3000/api/employees/resign/dispute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resignationId: "r-1", reason: "Bad" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(500);
  });
});
