import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockTriggerScreeningAfterFitScore = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (ctx: { role: string } | null, ...roles: string[]) =>
    Boolean(ctx && roles.includes(ctx.role)),
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
  handleZodError: () =>
    new Response(JSON.stringify({ error: "Invalid request payload" }), { status: 422 }),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), { status }),
  jsonSuccess: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  handleApiError: (_error: unknown, msg: string) =>
    new Response(JSON.stringify({ error: msg }), { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/screening/trigger", () => ({
  triggerScreeningAfterFitScore: (...args: unknown[]) => mockTriggerScreeningAfterFitScore(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

const mockAssertJobAccess = vi.fn();

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

describe("POST /api/screening/trigger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });
  });

  it("blocks cross-org recruiter requests before admin trigger runs", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockAssertJobAccess.mockResolvedValue({ job: null });
    mockCreateSupabaseServerClient.mockResolvedValue({});

    const { POST } = await import("@/app/api/screening/trigger/route");
    const request = new NextRequest("http://localhost/api/screening/trigger", {
      method: "POST",
      body: JSON.stringify({
        req_id: "123e4567-e89b-42d3-a456-426614174112",
        candidate_id: "123e4567-e89b-42d3-a456-426614174222",
        triggered_by: "auto",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(403);
    expect(mockCreateSupabaseAdmin).not.toHaveBeenCalled();
    expect(mockTriggerScreeningAfterFitScore).not.toHaveBeenCalled();
  });

  it("allows same-org recruiter requests to trigger screening", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockCreateSupabaseServerClient.mockResolvedValue({});
    mockCreateSupabaseAdmin.mockReturnValue({ from: vi.fn() });
    mockTriggerScreeningAfterFitScore.mockResolvedValue({
      id: "screening-1",
      organisation_id: "org-1",
    });

    const { POST } = await import("@/app/api/screening/trigger/route");
    const request = new NextRequest("http://localhost/api/screening/trigger", {
      method: "POST",
      body: JSON.stringify({
        req_id: "123e4567-e89b-42d3-a456-426614174111",
        candidate_id: "123e4567-e89b-42d3-a456-426614174222",
        triggered_by: "auto",
      }),
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.job.id).toBe("screening-1");
    expect(mockTriggerScreeningAfterFitScore).toHaveBeenCalledTimes(1);
  });
});
