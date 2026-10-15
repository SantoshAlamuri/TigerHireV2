import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, hiringManagerCtx, candidateCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = (await request.json()) as Record<string, unknown>;
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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
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

// GET constructs an admin client before the (mocked) workflow snapshot call;
// stub it so createSupabaseAdmin() doesn't throw on missing env in tests.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: "REQ-1", error: null }),
  }),
}));

// The GET route enriches with a workflow snapshot; stub just that call (keep the
// rest of the module real so PATCH/decision tests are unaffected) so it doesn't
// throw against the lightweight supabase mock used here.
vi.mock("@/lib/workflows/requisition-approval-workflow", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/workflows/requisition-approval-workflow")>();
  return {
    ...actual,
    startRequisitionApprovalWorkflow: vi.fn(),
    getRequisitionWorkflowSnapshot: vi.fn().mockResolvedValue({
      instanceStatus: null,
      awaitingRoles: [],
      issue: null,
      pendingTaskId: null,
    }),
  };
});

vi.mock("@/lib/audit/hiring-offer-audit", () => ({ recordHiringOfferAuditEvent: vi.fn() }));
vi.mock("@/lib/hiring-requests/classification-validation", () => ({
  validateHiringRequestClassificationAgainstBands: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/hiring-requests/headcount-plan-validation", () => ({
  validateHiringRequestAgainstHeadcountPlan: vi.fn().mockResolvedValue({ ok: true, lineId: null }),
}));
vi.mock("@/lib/settings/permissions", () => ({
  getOrgSettingsPermissions: vi.fn().mockResolvedValue({}),
  resolveRequisitionApprovalWorkflowDefinitionKey: () => "default",
}));

function chainableMock(data: unknown, error: unknown = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error }),
    update: vi.fn().mockReturnThis(),
  };
  return chain;
}

describe("GET /api/hiring-requests/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when hiring request not found", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockFrom.mockReturnValue(chainableMock(null, new Error("not found")));
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-missing");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when hiring_manager fetches another user's request", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockFrom.mockReturnValue(
      chainableMock({ id: "hr-1", created_by: "other-user", organisation_id: "org-1" }),
    );
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 200 when hiring_manager fetches own request", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const requestData = {
      id: "hr-1",
      created_by: hiringManagerCtx.userId,
      organisation_id: "org-1",
      title: "Engineer",
    };
    mockFrom.mockReturnValue(chainableMock(requestData));
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.request).toBeDefined();
    expect(body.request.id).toBe("hr-1");
  });

  it("returns 200 when recruiter fetches request for same org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const requestData = {
      id: "hr-1",
      created_by: "hm-1",
      organisation_id: recruiterCtx.organisationId,
      title: "Engineer",
    };
    mockFrom.mockReturnValue(chainableMock(requestData));
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 403 when recruiter fetches request for different org", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(
      chainableMock({
        id: "hr-1",
        created_by: "hm-1",
        organisation_id: "other-org",
        title: "Engineer",
      }),
    );
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 for disallowed role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1");
    const res = await GET(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /api/hiring-requests/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when body is invalid JSON", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockFrom.mockReturnValue(
      chainableMock({ id: "hr-1", created_by: hiringManagerCtx.userId, status: "pending" }),
    );
    const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "hr-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when hiring request not found on PATCH", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    mockFrom.mockReturnValue(chainableMock(null, new Error("not found")));
    const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/hiring-requests/hr-missing", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "hr-missing" }) });
    expect(res.status).toBe(404);
  });
});

describe("creator-owned recruiter drafts", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });
  it.each([
    ["another author", { created_by: "other" }, { title: "Updated" }, 403],
    ["another tenant", { organisation_id: "other" }, { submit: true }, 403],
    ["submitted request", { status: "submitted" }, { title: "Updated" }, 409],
    ["approval smuggled into edit", {}, { title: "Updated", status: "approved" }, 400],
    ["invalid title", {}, { title: " " }, 400],
  ])("rejects %s without updating", async (_name, override, body, status) => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const chain = chainableMock({
      id: "hr-1",
      status: "draft",
      created_by: recruiterCtx.userId,
      organisation_id: recruiterCtx.organisationId,
      ...override,
    });
    mockFrom.mockReturnValue(chain);
    const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/hiring-requests/hr-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: "hr-1" }) },
    );
    expect(response.status).toBe(status);
    expect(chain.update).not.toHaveBeenCalled();
  });
});

it.each(["recruiter", "leadership"])(
  "allows %s to save and submit their own draft through review",
  async (role) => {
    mockGetAuthContext.mockResolvedValue({ ...recruiterCtx, role });
    const chain = chainableMock({
      id: "hr-1",
      title: "Engineer",
      status: "draft",
      created_by: recruiterCtx.userId,
      organisation_id: recruiterCtx.organisationId,
    });
    mockFrom.mockImplementation((table: string) =>
      table === "profiles"
        ? { select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }
        : chain,
    );
    const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
    const response = await PATCH(
      new NextRequest("http://localhost:3000/api/hiring-requests/hr-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated role", submit: true }),
      }),
      { params: Promise.resolve({ id: "hr-1" }) },
    );
    expect(response.status).toBe(200);
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Updated role", status: "under_review", req_code: "REQ-1" }),
    );
  },
);

it("validates cleared classification values rather than old budget and level", async () => {
  mockGetAuthContext.mockResolvedValue(recruiterCtx);
  const chain = chainableMock({
    id: "hr-1",
    title: "Engineer",
    status: "draft",
    created_by: recruiterCtx.userId,
    organisation_id: recruiterCtx.organisationId,
    role_level: "senior",
    budget_ctc_min: 1000000,
    budget_ctc_max: 2000000,
  });
  mockFrom.mockImplementation((table: string) =>
    table === "profiles"
      ? { select: () => ({ eq: () => ({ in: async () => ({ data: [] }) }) }) }
      : chain,
  );
  const { PATCH } = await import("@/app/api/hiring-requests/[id]/route");
  await PATCH(
    new NextRequest("http://localhost:3000/api/hiring-requests/hr-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        submit: true,
        roleLevel: null,
        budgetCtcMin: null,
        budgetCtcMax: null,
      }),
    }),
    { params: Promise.resolve({ id: "hr-1" }) },
  );
  const { validateHiringRequestClassificationAgainstBands } =
    await import("@/lib/hiring-requests/classification-validation");
  expect(validateHiringRequestClassificationAgainstBands).toHaveBeenLastCalledWith(
    expect.anything(),
    expect.objectContaining({ roleLevel: null, budgetCtcMin: null, budgetCtcMax: null }),
  );
});
