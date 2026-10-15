import { describe, it, expect, vi, beforeEach } from "vitest";
import { hiringManagerCtx, recruiterCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockAllocateReqCode = vi.fn().mockResolvedValue({ data: "REQ-GEN-2026-001", error: null });
const mockStartRequisitionApprovalWorkflow = vi.fn().mockResolvedValue(undefined);
let insertedHiringRequest: Record<string, unknown> | null = null;
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
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const chainMock = (data: unknown = null, error: unknown = null) => {
  const m: Record<string, unknown> = {};
  for (const method of ["select", "update", "eq", "in", "order", "neq", "or", "limit", "range"]) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.insert = vi.fn((payload: Record<string, unknown>) => {
    insertedHiringRequest = payload;
    return m;
  });
  m.single = vi.fn().mockResolvedValue({ data, error });
  m.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: data ? [data] : [], error }));
  return m;
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: vi.fn((table: string) =>
        table === "compensation_bands" ? chainMock(null) : chainMock({ id: "hr-1", title: "Test" }),
      ),
    }),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: mockAllocateReqCode,
  }),
}));

vi.mock("@/lib/workflows/requisition-approval-workflow", () => ({
  startRequisitionApprovalWorkflow: mockStartRequisitionApprovalWorkflow,
}));

const mockAutoApprove = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/hiring-requests/platform-admin-auto-approve", () => ({
  autoApproveRequisitionForPlatformAdmin: (...args: unknown[]) => mockAutoApprove(...args),
}));

vi.mock("@/lib/settings/permissions", () => ({
  getOrgSettingsPermissions: vi.fn().mockResolvedValue({}),
  resolveRequisitionApprovalWorkflowDefinitionKey: vi.fn().mockReturnValue("default"),
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit/client-ip", () => ({
  getRequestClientIp: () => "127.0.0.1",
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/hiring-requests", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests");
    const res = await GET(req as any);
    expect(res.status).toBe(403);
  });

  it("returns 200 for hiring manager", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { GET } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
  });

  it("returns 200 for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toBeDefined();
  });
});

describe("POST /api/hiring-requests", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAllocateReqCode.mockClear();
    mockStartRequisitionApprovalWorkflow.mockClear();
    mockAutoApprove.mockClear();
    insertedHiringRequest = null;
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Test" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(401);
  });

  it("allows recruiter to save as draft when saveDraft=true", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Role", saveDraft: true }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(insertedHiringRequest?.status).toBe("draft");
    expect(insertedHiringRequest?.submitted_at).toBeNull();
    expect(mockAllocateReqCode).not.toHaveBeenCalled();
    expect(mockStartRequisitionApprovalWorkflow).not.toHaveBeenCalled();
  });

  it("returns 422 when title is missing", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(422);
  });

  it("returns 201 when request is created", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Senior Engineer",
        department: "Engineering",
        urgency: "high",
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
  });

  it("auto-approves and skips review workflow when submitter is a platform admin", async () => {
    mockGetAuthContext.mockResolvedValue({ ...hiringManagerCtx, isPlatformAdmin: true });
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Platform Admin Role", urgency: "normal" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.request.status).toBe("approved");
    expect(mockAutoApprove).toHaveBeenCalledTimes(1);
    expect(mockStartRequisitionApprovalWorkflow).not.toHaveBeenCalled();
  });

  it("does not auto-approve a platform admin's draft", async () => {
    mockGetAuthContext.mockResolvedValue({ ...hiringManagerCtx, isPlatformAdmin: true });
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Draft Role", saveDraft: true }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(mockAutoApprove).not.toHaveBeenCalled();
  });

  it("starts the review workflow for non-platform-admin submitters", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/hiring-requests/route");
    const req = new Request("http://localhost:3000/api/hiring-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Normal Role", urgency: "normal" }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    expect(mockAutoApprove).not.toHaveBeenCalled();
    expect(mockStartRequisitionApprovalWorkflow).toHaveBeenCalledTimes(1);
  });
});
