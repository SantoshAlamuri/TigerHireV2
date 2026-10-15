import { beforeEach, describe, expect, it, vi } from "vitest";
import { agencyCtx } from "../../helpers";

const mockGetAuthContext = vi.fn();
const mockEnqueueAgencyCandidateScoring = vi.fn();
const mockFilterAgencyAccessibleCandidateIds = vi.fn();

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
  handleApiError: (err: unknown, msg: string) =>
    new Response(
      JSON.stringify({
        error: msg,
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    ),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({}),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: vi.fn(),
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/agency/enqueue-candidate-scoring", () => ({
  enqueueAgencyCandidateScoring: (...args: unknown[]) => mockEnqueueAgencyCandidateScoring(...args),
  filterAgencyAccessibleCandidateIds: (...args: unknown[]) =>
    mockFilterAgencyAccessibleCandidateIds(...args),
}));

describe("POST /api/agency/enqueue-scoring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockFilterAgencyAccessibleCandidateIds.mockResolvedValue([
      "00000000-0000-4000-8000-000000000001",
    ]);
    mockEnqueueAgencyCandidateScoring.mockResolvedValue({ queued: 1, total: 1 });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/agency/enqueue-scoring/route");
    const res = await POST(
      new Request("http://localhost/api/agency/enqueue-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: ["00000000-0000-4000-8000-000000000001"],
        }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-agency roles", async () => {
    mockGetAuthContext.mockResolvedValue({ ...agencyCtx, role: "candidate" });
    const { POST } = await import("@/app/api/agency/enqueue-scoring/route");
    const res = await POST(
      new Request("http://localhost/api/agency/enqueue-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: ["00000000-0000-4000-8000-000000000001"],
        }),
      }),
    );
    expect(res.status).toBe(403);
  });

  it("queues accessible candidates", async () => {
    const { POST } = await import("@/app/api/agency/enqueue-scoring/route");
    const res = await POST(
      new Request("http://localhost/api/agency/enqueue-scoring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateIds: [
            "00000000-0000-4000-8000-000000000001",
            "00000000-0000-4000-8000-000000000099",
          ],
        }),
      }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ queued: 1, total: 1 });
    expect(mockEnqueueAgencyCandidateScoring).toHaveBeenCalledWith(
      ["00000000-0000-4000-8000-000000000001"],
      expect.objectContaining({ organisationId: agencyCtx.organisationId }),
    );
  });
});
