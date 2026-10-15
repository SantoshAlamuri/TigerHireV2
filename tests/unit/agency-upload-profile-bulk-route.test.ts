import { describe, it, expect, vi, beforeEach } from "vitest";
import { agencyCtx, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockSavePublicApplication = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockNotifyCvIngestedFromAgencyBulk = vi.fn();
const mockOrganisationGetById = vi.fn();
const mockOrganisationGetBySlug = vi.fn();

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
  savePublicApplication: (...args: unknown[]) => mockSavePublicApplication(...args),
}));

vi.mock("@/lib/acknowledgements/agency-bulk", () => ({
  notifyCvIngestedFromAgencyBulk: (...args: unknown[]) =>
    mockNotifyCvIngestedFromAgencyBulk(...args),
}));

vi.mock("@/lib/repositories/OrganisationRepository", () => ({
  OrganisationRepository: {
    getById: (...args: unknown[]) => mockOrganisationGetById(...args),
    getBySlug: (...args: unknown[]) => mockOrganisationGetBySlug(...args),
  },
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/idempotency", () => ({
  withIdempotency: async (_req: Request, _endpoint: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

class MockBulkFile extends File {
  private readonly mockBuffer: Uint8Array;

  constructor(contents: string, name: string, type = "application/pdf") {
    super([contents], name, { type });
    this.mockBuffer = new TextEncoder().encode(contents);
  }

  override async arrayBuffer(): Promise<ArrayBuffer> {
    return this.mockBuffer.slice().buffer;
  }
}

function createTestFile(contents: string, name: string, type = "application/pdf") {
  return new MockBulkFile(contents, name, type);
}

async function createFormData(
  overrides: {
    files?: File[];
    clientOrgId?: string | null;
    slug?: string | null;
    jobId?: string | null;
  } = {},
) {
  const formData = new FormData();
  const files = overrides.files ?? [
    createTestFile("pdf1", "a.pdf"),
    createTestFile("pdf2", "b.pdf"),
  ];
  files.forEach((f) => formData.append("files", f));
  if (overrides.clientOrgId != null) formData.set("clientOrgId", overrides.clientOrgId);
  if (overrides.slug != null) formData.set("slug", overrides.slug);
  if (overrides.jobId != null) formData.set("jobId", overrides.jobId);
  return formData;
}

function createMockRequest(
  formData: FormData,
  url = "http://localhost/api/agency/upload-profile/bulk",
) {
  return {
    headers: new Headers(),
    url,
    formData: vi.fn().mockResolvedValue(formData),
  } as unknown as Request;
}

describe("POST /api/agency/upload-profile/bulk", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    mockCreateSupabaseServerClient.mockResolvedValue({ from: vi.fn() });
    mockNotifyCvIngestedFromAgencyBulk.mockResolvedValue(undefined);
    mockOrganisationGetById.mockResolvedValue({ id: "org-x", name: "Org Name" });
    mockOrganisationGetBySlug.mockResolvedValue({ id: "client-1", name: "Client Org" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const files = [createTestFile("pdf1", "a.pdf"), createTestFile("pdf2", "b.pdf")];
    const formData = {
      getAll: vi.fn((key: string) => (key === "files" ? files : [])),
      get: vi.fn((key: string) => (key === "clientOrgId" ? "client-1" : null)),
    };
    const req = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not agency", async () => {
    mockGetAuthContext.mockResolvedValue({
      ...agencyCtx,
      role: "recruiter",
    });
    const files = [createTestFile("pdf1", "a.pdf"), createTestFile("pdf2", "b.pdf")];
    const formData = {
      getAll: vi.fn((key: string) => (key === "files" ? files : [])),
      get: vi.fn((key: string) => (key === "clientOrgId" ? "client-1" : null)),
    };
    const req = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when neither clientOrgId nor slug", async () => {
    const formData = await createFormData({});
    formData.delete("clientOrgId");
    formData.delete("slug");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when no files", async () => {
    const formData = new FormData();
    formData.set("clientOrgId", "client-1");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/file|required/i);
  });

  it("returns 400 when more than AGENCY_UPLOAD_CLIENT_BATCH_SIZE files per request", async () => {
    const { AGENCY_UPLOAD_CLIENT_BATCH_SIZE } = await import("@/lib/constants/agency-bulk-upload");
    const files = Array.from({ length: AGENCY_UPLOAD_CLIENT_BATCH_SIZE + 1 }, (_, i) =>
      createTestFile("x", `f${i}.pdf`),
    );
    const formData = await createFormData({
      files,
      clientOrgId: "client-1",
      jobId: "job-1",
    });
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(new RegExp(`${AGENCY_UPLOAD_CLIENT_BATCH_SIZE}|Maximum`));
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const formData = await createFormData({ clientOrgId: "client-1" });
    const req = new Request("http://localhost/api/agency/upload-profile/bulk", {
      method: "POST",
      body: formData,
    });
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 503 when rate limit check throws (fail closed)", async () => {
    mockCheckRateLimit.mockRejectedValue(new Error("redis unavailable"));

    const files = [createTestFile("pdf1", "a.pdf")];
    const formData = {
      getAll: vi.fn((key: string) => (key === "files" ? files : [])),
      get: vi.fn((key: string) => {
        if (key === "clientOrgId") return "client-1";
        if (key === "email") return "alice@example.com";
        return null;
      }),
    };
    const req = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);

    expect(res.status).toBe(503);
    expect(mockSavePublicApplication).not.toHaveBeenCalled();
  });

  it("returns 422 when a single file is uploaded without email", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linkBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const files = [createTestFile("pdf1", "a.pdf")];
    const formData = {
      getAll: vi.fn((key: string) => (key === "files" ? files : [])),
      get: vi.fn((key: string) => (key === "clientOrgId" ? "client-1" : null)),
    };
    const req = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(422);
    expect(mockSavePublicApplication).not.toHaveBeenCalled();
  });

  it("returns 400 when jobId is missing", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linkBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    const formData = await createFormData({
      clientOrgId: "client-1",
      jobId: null,
    });
    formData.delete("jobId");
    const req = createMockRequest(formData);
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/target role|open job/i);
    expect(mockSavePublicApplication).not.toHaveBeenCalled();
  });

  it("returns 201 quickly with saved results when client linked", async () => {
    const linkBuilder = createMockQueryBuilder({
      data: { client_organisation_id: "client-1" },
    });
    const jobsBuilder = createMockQueryBuilder({
      data: { id: "job-1", title: "QA Engineer" },
    });
    const applicationsBuilder = createMockQueryBuilder({
      data: null,
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linkBuilder;
        if (table === "jobs") return jobsBuilder;
        if (table === "applications") return applicationsBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    mockSavePublicApplication
      .mockResolvedValueOnce({
        candidateId: "c1",
        candidateName: "Alice",
        cvUrl: "https://example.com/a.pdf",
      })
      .mockResolvedValueOnce({
        candidateId: "c2",
        candidateName: "Bob",
        cvUrl: "https://example.com/b.pdf",
      });

    const files = [createTestFile("pdf1", "a.pdf"), createTestFile("pdf2", "b.pdf")];
    const formData = {
      getAll: vi.fn((key: string) => (key === "files" ? files : [])),
      get: vi.fn((key: string) => {
        if (key === "clientOrgId") return "client-1";
        if (key === "jobId") return "job-1";
        return null;
      }),
    };
    const req = {
      formData: vi.fn().mockResolvedValue(formData),
    } as unknown as Request;
    const { POST } = await import("@/app/api/agency/upload-profile/bulk/route");
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.results).toHaveLength(2);
    expect(body.results).toEqual([
      expect.objectContaining({
        fileName: "a.pdf",
        success: true,
        candidateId: "c1",
        candidateName: "Alice",
        parsingPending: true,
      }),
      expect.objectContaining({
        fileName: "b.pdf",
        success: true,
        candidateId: "c2",
        candidateName: "Bob",
        parsingPending: true,
      }),
    ]);
    expect(body.summary.total).toBe(2);
    expect(body.summary.succeeded).toBe(2);
    expect(body.summary.failed).toBe(0);
    expect(body.summary.pending).toBe(2);
    expect(mockSavePublicApplication).toHaveBeenCalledTimes(2);
  }, 30000);
});
