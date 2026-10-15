import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockEnqueue = vi.fn();
const mockUpsert = vi.fn();

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
  jsonSuccess: (payload: unknown, status = 200) => Response.json(payload, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
  handleZodError: () => Response.json({ error: "Validation error" }, { status: 422 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

vi.mock("@/lib/services/headcount-plan-sync", () => ({
  upsertApprovedHeadcountPlan: (...args: unknown[]) => mockUpsert(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

describe("headcount plan sync route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "ca-1",
      role: "leadership",
      organisationId: "org-1",
    });
  });

  it("queues sync when Inngest is available", async () => {
    mockEnqueue.mockResolvedValue({ id: "run-1" });
    const { POST } = await import("@/app/api/headcount-plans/sync/route");
    const req = new NextRequest("http://localhost/api/headcount-plans/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planCode: "FY27-ENG",
        title: "FY27 Engineering",
        fiscalYear: 2027,
        lines: [{ roleLevel: "L4", headcountLimit: 2 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued).toBe(true);
    expect(body.runId).toBe("run-1");
  });

  it("falls back to direct sync when queue unavailable", async () => {
    mockEnqueue.mockResolvedValue({});
    mockUpsert.mockResolvedValue({ planId: "hp-1", lineCount: 1 });
    const { POST } = await import("@/app/api/headcount-plans/sync/route");
    const req = new NextRequest("http://localhost/api/headcount-plans/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        planCode: "FY27-ENG",
        title: "FY27 Engineering",
        fiscalYear: 2027,
        lines: [{ roleLevel: "L4", headcountLimit: 2 }],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued).toBe(false);
    expect(body.synced.planId).toBe("hp-1");
  });
});
