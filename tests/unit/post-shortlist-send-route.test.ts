import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockAssertJobAccess = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockPreview = vi.fn();
const mockSend = vi.fn();

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

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: (parts: Record<string, string>) => JSON.stringify(parts),
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/prescreen/bulk-post-shortlist", () => ({
  previewPostShortlistSend: (...args: unknown[]) => mockPreview(...args),
  sendPostShortlistToShortlisted: (...args: unknown[]) => mockSend(...args),
}));

const ROUTE = "@/app/api/jobs/[id]/post-shortlist-send/route";
const params = Promise.resolve({ id: "job-1" });
const CAND_UUID = "123e4567-e89b-42d3-a456-426614174222";

function getRequest(url = "http://localhost/api/jobs/job-1/post-shortlist-send") {
  return new NextRequest(url);
}

function postRequest(body: unknown) {
  return new NextRequest("http://localhost/api/jobs/job-1/post-shortlist-send", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mockGetAuthContext.mockResolvedValue({
    userId: "user-1",
    role: "recruiter",
    organisationId: "org-1",
  });
  mockCreateSupabaseServerClient.mockResolvedValue({});
  mockCreateSupabaseAdmin.mockReturnValue({ from: vi.fn() });
  mockAssertJobAccess.mockResolvedValue({
    job: { id: "job-1", organisation_id: "org-1" },
  });
  mockCheckRateLimit.mockResolvedValue({ allowed: true });
});

describe("GET /api/jobs/[id]/post-shortlist-send", () => {
  it("rejects unauthenticated requests", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import(ROUTE);

    const response = await GET(getRequest(), { params });
    expect(response.status).toBe(401);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("rejects roles outside the reader set", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u", role: "candidate_free" });
    const { GET } = await import(ROUTE);

    const response = await GET(getRequest(), { params });
    expect(response.status).toBe(403);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("returns 404 when job access is denied", async () => {
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { GET } = await import(ROUTE);

    const response = await GET(getRequest(), { params });
    expect(response.status).toBe(404);
    expect(mockPreview).not.toHaveBeenCalled();
  });

  it("returns the preview and passes forceResend through", async () => {
    mockPreview.mockResolvedValue({ shortlistedTotal: 5, eligibleToSend: 3 });
    const { GET } = await import(ROUTE);

    const response = await GET(
      getRequest("http://localhost/api/jobs/job-1/post-shortlist-send?forceResend=true"),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.eligibleToSend).toBe(3);
    // 4th arg: resend session states — nonRespondersOnly defaults to true on force-resend,
    // so the preview scopes to awaiting_consent sessions unless nonRespondersOnly=false.
    expect(mockPreview).toHaveBeenCalledWith(expect.anything(), "job-1", true, [
      "awaiting_consent",
    ]);
  });

  it("allows agency users to preview", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u", role: "agency", organisationId: "ag-1" });
    mockPreview.mockResolvedValue({ shortlistedTotal: 0 });
    const { GET } = await import(ROUTE);

    const response = await GET(getRequest(), { params });
    expect(response.status).toBe(200);
  });
});

describe("POST /api/jobs/[id]/post-shortlist-send", () => {
  it("rejects agency users from sending (read-only role)", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u", role: "agency", organisationId: "ag-1" });
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({}), { params });
    expect(response.status).toBe(403);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 429 when the rate limit is exhausted", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({}), { params });
    expect(response.status).toBe(429);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects payloads with unknown keys (strict schema)", async () => {
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({ dryRun: true, sendNow: true }), { params });
    expect(response.status).toBe(422);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("rejects non-uuid candidateIds", async () => {
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({ candidateIds: ["c-1"] }), { params });
    expect(response.status).toBe(422);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 404 before sending when job access is denied", async () => {
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({}), { params });
    expect(response.status).toBe(404);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("sends with the job's organisation and the parsed flags", async () => {
    mockSend.mockResolvedValue({ dryRun: false, sent: 2, skipped: 1, failed: 0, reset: 1 });
    const { POST } = await import(ROUTE);

    const response = await POST(
      postRequest({ dryRun: false, forceResend: true, candidateIds: [CAND_UUID] }),
      { params },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sent).toBe(2);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        organisationId: "org-1",
        dryRun: false,
        forceResend: true,
        candidateIds: [CAND_UUID],
      }),
    );
  });

  it("surfaces send failures as a 500 via handleApiError", async () => {
    mockSend.mockRejectedValue(
      new Error(
        "Add post-shortlist questions on the Plan page (After shortlist tab) before sending.",
      ),
    );
    const { POST } = await import(ROUTE);

    const response = await POST(postRequest({}), { params });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toMatch(/post-shortlist questions/);
  });
});
