import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx, hiringManagerCtx } from "../helpers";

// next/server's after() requires a real request context at runtime; mock it
// to invoke the callback synchronously so the route's post-response work still
// runs (and is observable) inside the unit test harness.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => unknown | Promise<unknown>) => {
      void Promise.resolve().then(() => cb());
    },
  };
});

const mockGetAuthContext = vi.fn();
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
  validateOrigin: () => null,
}));

const mockListForCandidate = vi.fn().mockResolvedValue({
  applications: [{ id: "a1" }],
  pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
});
const mockListForRecruiter = vi.fn().mockResolvedValue({
  applications: [{ id: "a1" }, { id: "a2" }],
  pagination: { page: 1, limit: 10, total: 2, totalPages: 1 },
});
const mockCreate = vi.fn().mockResolvedValue({ id: "a-new", status: "applied" });
const mockGetByUserId = vi.fn().mockResolvedValue({ id: "c1" });
const mockJobsSingle = vi.fn().mockResolvedValue({
  data: {
    id: "j1",
    status: "open",
    title: "Software Engineer",
    organisation_id: "org-1",
    organisations: [{ name: "Acme Corp" }],
  },
  error: null,
});
const mockCandidatePhoneMaybeSingle = vi.fn().mockResolvedValue({
  data: { phone: null },
  error: null,
});

vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    listForCandidate: (...args: unknown[]) => mockListForCandidate(...args),
    listForRecruiter: (...args: unknown[]) => mockListForRecruiter(...args),
    create: (...args: unknown[]) => mockCreate(...args),
  },
}));

vi.mock("@/lib/services/CandidateService", () => ({
  CandidateService: {
    getByUserId: (...args: unknown[]) => mockGetByUserId(...args),
  },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn().mockResolvedValue(undefined),
  },
}));

const mockSupabase = {
  from: vi.fn((table: string) => {
    if (table === "jobs") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: mockJobsSingle,
      };
    }
    if (table === "candidates") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: mockCandidatePhoneMaybeSingle,
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  }),
};
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve(mockSupabase),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabase,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: () => Promise.resolve({ allowed: true, remaining: 10, resetAt: new Date() }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockNotifyCvIngestedFromLoggedInApply = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/acknowledgements/cv-ingested", () => ({
  notifyCvIngestedFromLoggedInApply: (...args: unknown[]) =>
    mockNotifyCvIngestedFromLoggedInApply(...args),
}));

const mockEnqueue = vi.fn();
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const mockIsJdBaseApproved = vi.fn().mockResolvedValue(true);
const mockEnqueuePendingJdApprovalPair = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  enqueuePendingJdApprovalPair: (...args: unknown[]) => mockEnqueuePendingJdApprovalPair(...args),
}));

describe("GET /api/applications", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns candidate's own applications", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications?page=1&limit=10");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applications).toBeDefined();
  });

  it("returns all applications for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications?page=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 403 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { GET } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});

describe("POST /api/applications", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCreate.mockClear();
    mockGetByUserId.mockClear();
    mockJobsSingle.mockReset();
    mockJobsSingle.mockResolvedValue({
      data: {
        id: "j1",
        status: "open",
        title: "Software Engineer",
        organisation_id: "org-1",
        organisations: [{ name: "Acme Corp" }],
      },
      error: null,
    });
    mockCandidatePhoneMaybeSingle.mockReset();
    mockCandidatePhoneMaybeSingle.mockResolvedValue({ data: { phone: null }, error: null });
    mockNotifyCvIngestedFromLoggedInApply.mockClear();
    mockEnqueue.mockClear();
    mockEnqueue.mockResolvedValue({ id: "evt-1" });
    mockIsJdBaseApproved.mockReset();
    mockIsJdBaseApproved.mockResolvedValue(true);
    mockEnqueuePendingJdApprovalPair.mockClear();
    process.env.INNGEST_EVENT_KEY = "test-event-key";
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "j1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-candidate roles", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "j1" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 201 when application is created", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue({ id: "c1" });

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.application).toBeDefined();
  });

  it("passes confidentialApply to application create payload", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue({ id: "c1" });

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
        confidentialApply: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.anything(),
      "c1",
      expect.objectContaining({
        confidentialApply: true,
      }),
    );
  });

  it("returns 400 when candidate profile not found", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue(null);

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("handles job.organisations as array and dispatches acknowledgement", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue({ id: "c1", email: "test@example.com", name: "Test User" });
    mockJobsSingle.mockResolvedValue({
      data: {
        id: "j1",
        status: "open",
        title: "Software Engineer",
        organisation_id: "org-1",
        organisations: [{ name: "Acme Corp" }],
      },
      error: null,
    });

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockNotifyCvIngestedFromLoggedInApply).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateEmail: "test@example.com",
        candidateName: "Test User",
        jobTitle: "Software Engineer",
        companyName: "Acme Corp",
      }),
    );
  });

  it("handles job.organisations as single object", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue({ id: "c1", email: "test@example.com", name: "Test User" });
    mockJobsSingle.mockResolvedValue({
      data: {
        id: "j1",
        status: "open",
        title: "Software Engineer",
        organisation_id: "org-1",
        organisations: { name: "Tech Inc" },
      },
      error: null,
    });

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockNotifyCvIngestedFromLoggedInApply).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateEmail: "test@example.com",
        candidateName: "Test User",
        jobTitle: "Software Engineer",
        companyName: "Tech Inc",
      }),
    );
  });

  it("handles null organisations gracefully", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockGetByUserId.mockResolvedValue({ id: "c1", email: "test@example.com", name: "Test User" });
    mockJobsSingle.mockResolvedValue({
      data: {
        id: "j1",
        status: "open",
        title: "Software Engineer",
        organisation_id: "org-1",
        organisations: null,
      },
      error: null,
    });

    const { POST } = await import("@/app/api/applications/route");
    const req = new NextRequest("http://localhost:3000/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "00000000-0000-4000-8000-000000000001",
        interest: "interested",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockNotifyCvIngestedFromLoggedInApply).toHaveBeenCalledWith(
      expect.objectContaining({
        candidateEmail: "test@example.com",
        candidateName: "Test User",
        jobTitle: "Software Engineer",
        companyName: "the company",
      }),
    );
  });
});
