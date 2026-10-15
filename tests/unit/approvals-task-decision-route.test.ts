import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      return { body: await request.json(), errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
  handleZodError: () => Response.json({ error: "Validation error" }, { status: 422 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

describe("POST /api/approvals/tasks/[taskId]/decision", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/approvals/tasks/[taskId]/decision/route");
    const req = new NextRequest("http://localhost/api/approvals/tasks/requisition:1/decision", {
      method: "POST",
      body: JSON.stringify({
        decision: "approved",
        requestId: "11111111-1111-1111-1111-111111111111",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ taskId: "requisition:1" }) });
    expect(res.status).toBe(401);
  });

  it("forwards shortlist decisions to pipeline approve endpoint", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const { POST } = await import("@/app/api/approvals/tasks/[taskId]/decision/route");
    const req = new NextRequest("http://localhost/api/approvals/tasks/shortlist:pc-1/decision", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "http://localhost" },
      body: JSON.stringify({
        decision: "approved",
        jobId: "job-1",
        candidateId: "cand-1",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ taskId: "shortlist:pc-1" }) });

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost/api/jobs/job-1/pipeline/approve",
      expect.objectContaining({ method: "POST" }),
    );
    fetchSpy.mockRestore();
  });

  it("returns 404 for unknown task source", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });
    const { POST } = await import("@/app/api/approvals/tasks/[taskId]/decision/route");
    const req = new NextRequest("http://localhost/api/approvals/tasks/unknown:1/decision", {
      method: "POST",
      body: JSON.stringify({ decision: "approved" }),
    });
    const res = await POST(req, { params: Promise.resolve({ taskId: "unknown:1" }) });
    expect(res.status).toBe(404);
  });
});
