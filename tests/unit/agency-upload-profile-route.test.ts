import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { agencyCtx, createMockSupabase, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockProcessPublicApplication = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockNotifyCvIngestedFromAgencySingle = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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

vi.mock("@/lib/agents/public-apply", () => ({
  savePublicApplication: (...args: unknown[]) => mockProcessPublicApplication(...args),
}));

vi.mock("@/lib/agency/enqueue-candidate-scoring", () => ({
  enqueueAgencyCandidateScoring: vi.fn().mockResolvedValue({ queued: 1 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/idempotency", () => ({
  withIdempotency: (_req: unknown, _route: unknown, handler: () => Promise<Response>) => handler(),
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

async function createFormData(
  overrides: {
    file?: File | null;
    clientOrgId?: string | null;
    slug?: string | null;
    jobId?: string | null;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  } = {},
) {
  const formData = new FormData();
  const file =
    overrides.file ??
    new File(["dummy pdf content"], "resume.pdf", {
      type: "application/pdf",
    });
  if (file) formData.set("file", file);
  if (overrides.clientOrgId != null) formData.set("clientOrgId", overrides.clientOrgId);
  if (overrides.slug != null) formData.set("slug", overrides.slug);
  if (overrides.jobId != null) formData.set("jobId", overrides.jobId);
  if (overrides.name != null) formData.set("name", overrides.name);
  if (overrides.phone != null) formData.set("phone", overrides.phone);
  if (overrides.email != null) formData.set("email", overrides.email);
  return formData;
}

function createMockRequest(formData: FormData, url = "http://localhost/api/agency/upload-profile") {
  return {
    headers: new Headers(),
    url,
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as NextRequest;
}

describe("POST /api/agency/upload-profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const jobsBuilder = createMockQueryBuilder({
      data: { id: "job-1" },
    });
    mockCreateSupabaseServerClient.mockResolvedValue(
      createMockSupabase({
        agency_clients: linkBuilder,
        jobs: jobsBuilder,
      }),
    );
    mockNotifyCvIngestedFromAgencySingle.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const formData = await createFormData({ clientOrgId: "client-1", email: "jane@example.com" });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not agency", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      role: "recruiter",
    });
    const formData = await createFormData({
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when no file", async () => {
    const formData = await createFormData({
      file: null as unknown as File,
      clientOrgId: "client-1",
    });
    formData.delete("file");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("file");
  });

  it("returns 400 when neither clientOrgId nor slug", async () => {
    const formData = new FormData();
    formData.set("file", new File(["x"], "resume.pdf", { type: "application/pdf" }));
    formData.set("email", "jane@example.com");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("clientOrgId or slug");
  });

  it("returns 400 when jobId is missing", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const supabase = createMockSupabase({ agency_clients: linkBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const formData = await createFormData({
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: null,
    });
    formData.delete("jobId");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/target role|open job/i);
    expect(mockProcessPublicApplication).not.toHaveBeenCalled();
  });

  it("returns 400 when file too large", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const supabase = createMockSupabase({ agency_clients: linkBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const largeContent = new Array(11 * 1024 * 1024).fill("x").join("");
    const largeFile = new File([largeContent], "big.pdf", {
      type: "application/pdf",
    });
    const formData = await createFormData({
      file: largeFile,
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("10 MB");
  });

  it("returns 400 when file type invalid", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const supabase = createMockSupabase({ agency_clients: linkBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const badFile = new File(["x"], "resume.exe", {
      type: "application/octet-stream",
    });
    const formData = await createFormData({
      file: badFile,
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/PDF|Word|invalid/i);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const formData = await createFormData({
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = new Request("http://localhost/api/agency/upload-profile", {
      method: "POST",
      body: formData,
    });
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 201 quickly with parsingPending when profile is saved", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const jobsBuilder = createMockQueryBuilder({ data: { id: "job-1" } });
    const supabase = createMockSupabase({
      agency_clients: linkBuilder,
      jobs: jobsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockProcessPublicApplication.mockResolvedValue({
      candidateId: "cand-1",
      candidateName: "Jane Doe",
      cvUrl: "https://example.com/cv.pdf",
      parsingPending: true,
      jobsScored: 0,
      topScore: null,
      scoringFailed: false,
      noOpenJobs: false,
    });

    const formData = await createFormData({
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = {
      headers: new Headers(),
      url: "http://localhost:3000/api/agency/upload-profile",
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as NextRequest;

    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.parsingPending).toBe(true);
    expect(body.candidateId).toBe("cand-1");
    expect(body.message).toMatch(/saved|Scoring/i);
  });

  it("returns 404 when client not linked to agency (clientOrgId)", async () => {
    const linkBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({ agency_clients: linkBuilder });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const formData = await createFormData({
      clientOrgId: "unknown-client",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/client|linked/i);
  });

  it("returns 201 and success when client linked and savePublicApplication succeeds", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const jobsBuilder = createMockQueryBuilder({ data: { id: "job-1" } });
    const supabase = createMockSupabase({
      agency_clients: linkBuilder,
      jobs: jobsBuilder,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    mockProcessPublicApplication.mockResolvedValue({
      candidateId: "cand-1",
      candidateName: "Jane Doe",
    });

    const formData = await createFormData({
      clientOrgId: "client-1",
      email: "jane@example.com",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/route");
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.candidateId).toBe("cand-1");
    expect(body.candidateName).toBe("Jane Doe");
    expect(body.parsingPending).toBe(true);
    expect(mockProcessPublicApplication).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "agency_upload",
        jobId: "job-1",
      }),
    );
  });
});
