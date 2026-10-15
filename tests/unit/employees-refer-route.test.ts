import { describe, it, expect, vi, beforeEach } from "vitest";
import { recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockAssertJobOwnership = vi.fn().mockResolvedValue(undefined);

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
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  handleApiError: (err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
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

const mockRefer = vi.fn().mockResolvedValue({
  referral: { id: "ref-1" },
  whatsapp: { reached: true, via: "test", error: null },
});
vi.mock("@/lib/services/EmployeeService", () => ({
  EmployeeService: { refer: (...args: unknown[]) => mockRefer(...args) },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/referrers/resolve-referrer-id", () => ({
  resolveReferrerIdForUser: vi.fn().mockResolvedValue("referrer-1"),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const employeeCtx = {
  userId: "user-emp-1",
  role: "employee",
  organisationId: "org-1",
};

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
  });

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

  it("returns 400 when employee has no org", async () => {
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

  it("returns 422 for invalid phone number", async () => {
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "123",
        candidate_name: "Jane",
        job_id: "00000000-0000-4000-8000-000000000001",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(422);
  });

  it("returns 403 when job does not belong to employee's organisation", async () => {
    const { ForbiddenError } = await import("@/lib/security/tenancy");
    mockAssertJobOwnership.mockRejectedValue(
      new ForbiddenError("Job does not belong to your company"),
    );
    mockGetAuthContext.mockResolvedValue(employeeCtx);
    const { POST } = await import("@/app/api/employees/refer/route");
    const req = new Request("http://localhost:3000/api/employees/refer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate_phone: "+919876543210",
        candidate_name: "Jane Doe",
        job_id: "00000000-0000-4000-8000-000000000002",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Job does not belong");
  });

  it("returns 201 when referral is created", async () => {
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
});
