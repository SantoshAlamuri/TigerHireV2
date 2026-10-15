import { beforeEach, describe, expect, it, vi } from "vitest";
import { agencyCtx, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockParseResumeWithClaude = vi.fn();
const mockFitScoreComputeSingle = vi.fn();
const mockCalculateGhostRiskScore = vi.fn();
const mockIsJdBaseApproved = vi.fn();

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

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/agents/cv-parser", () => ({
  parseCVWithClaude: vi.fn(),
  parseResumeWithClaude: (...args: unknown[]) => mockParseResumeWithClaude(...args),
  parseResumeFileWithClaude: (...args: unknown[]) => mockParseResumeWithClaude(...args),
}));

vi.mock("@/lib/services/FitScoreService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/FitScoreService")>();
  return {
    ...actual,
    FitScoreService: {
      ...actual.FitScoreService,
      computeSingle: (...args: unknown[]) => mockFitScoreComputeSingle(...args),
    },
  };
});

vi.mock("@/lib/agents/ghostbuster", () => ({
  calculateGhostRiskScore: (...args: unknown[]) => mockCalculateGhostRiskScore(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/redis/cache", () => ({
  cacheDel: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/redis/keys", () => ({
  myPipelineKey: (userId: string) => `pipeline:${userId}`,
}));

vi.mock("@/lib/redis/fitscore-cache", () => ({
  invalidateFitScoreCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  JD_BASE_NOT_APPROVED_MESSAGE:
    "JD Base awaiting hiring manager approval. Review weights and approve before scoring.",
}));

vi.mock("@/lib/services/extract-document-text", () => ({
  extractTextFromBuffer: vi.fn().mockResolvedValue("extracted text"),
  inferMimeFromName: vi.fn().mockReturnValue("application/pdf"),
}));

describe("POST /api/agency/reprocess-candidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    mockCalculateGhostRiskScore.mockReturnValue(12);
    mockParseResumeWithClaude.mockResolvedValue({
      parsed: {
        full_name: "Parsed Candidate",
        email: "parsed@example.com",
        current_title: "Engineer",
        current_company: "Acme",
        canonical_skills: ["TypeScript"],
        years_experience: 5,
        location_city: "Bengaluru",
        availability: "Immediate",
        seniority_level: "mid",
        salary_expectation_min: 10,
        salary_expectation_max: 15,
      },
      rawTextForStorage: "resume text",
    });
    mockFitScoreComputeSingle.mockResolvedValue({ overall_score: 88 });
    mockIsJdBaseApproved.mockReset();
    mockIsJdBaseApproved.mockResolvedValue(true);
  });

  it("reprocesses a candidate saved from bulk upload using stored candidate-cvs file", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linksBuilder;
        throw new Error(`Unexpected server table: ${table}`);
      }),
    });

    const candidateLookupBuilder = createMockQueryBuilder({
      data: {
        id: "cand-1",
        name: "Stored Candidate",
        email: "stored@example.com",
        phone: null,
        cv_url: "https://example.supabase.co/storage/v1/object/public/candidate-cvs/cvs/test.pdf",
        resume_url: null,
      },
    });
    const candidateReloadBuilder = createMockQueryBuilder({
      data: {
        id: "cand-1",
        name: "Parsed Candidate",
        full_name: "Parsed Candidate",
        skills: ["TypeScript"],
        experience_years: 5,
        location: "Bengaluru",
        resume_url:
          "https://example.supabase.co/storage/v1/object/public/candidate-cvs/cvs/test.pdf",
        updated_at: "2026-03-07T00:00:00.000Z",
      },
    });
    const candidateUpdateBuilder = createMockQueryBuilder();
    const pipelineBuilder = createMockQueryBuilder({
      data: [{ job_id: "job-1" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "job-1",
          title: "Software Engineer",
          description: "Build products",
          location: "Bengaluru",
          status: "open",
          compensation_min: 10,
          compensation_max: 20,
          organisation_id: "client-1",
        },
      ],
    });

    const downloadMock = vi.fn().mockResolvedValue({ data: new Blob(["pdf-bytes"]), error: null });
    let candidateSelectCount = 0;
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return {
            select: vi.fn(() => {
              candidateSelectCount += 1;
              return candidateSelectCount === 1 ? candidateLookupBuilder : candidateReloadBuilder;
            }),
            update: vi.fn(() => candidateUpdateBuilder),
          };
        }
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "jobs") return jobsBuilder;
        throw new Error(`Unexpected admin table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          download: downloadMock,
        })),
      },
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const req = new Request("http://localhost/api/agency/reprocess-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: ["cand-1"] }),
    });

    const { POST } = await import("@/app/api/agency/reprocess-candidates/route");
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(downloadMock).toHaveBeenCalledWith("cvs/test.pdf");
    expect(body.results).toEqual([
      {
        candidateId: "cand-1",
        candidateName: "Parsed Candidate",
        success: true,
        score: 88,
        jobScores: [{ jobId: "job-1", score: 88 }],
      },
    ]);
  });

  it("rejects candidates outside the agency client scope", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linksBuilder;
        throw new Error(`Unexpected server table: ${table}`);
      }),
    });

    const candidateLookupBuilder = createMockQueryBuilder({
      data: {
        id: "cand-2",
        name: "Outside Candidate",
        email: "outside@example.com",
        phone: null,
        cv_url:
          "https://example.supabase.co/storage/v1/object/public/candidate-cvs/cvs/outside.pdf",
        resume_url: null,
      },
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [{ job_id: "job-9" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [],
    });

    const downloadMock = vi.fn();
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return {
            select: vi.fn(() => candidateLookupBuilder),
            update: vi.fn(),
          };
        }
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "jobs") return jobsBuilder;
        throw new Error(`Unexpected admin table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          download: downloadMock,
        })),
      },
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const req = new Request("http://localhost/api/agency/reprocess-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: ["cand-2"] }),
    });

    const { POST } = await import("@/app/api/agency/reprocess-candidates/route");
    const res = await POST(req as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(downloadMock).not.toHaveBeenCalled();
    expect(mockParseResumeWithClaude).not.toHaveBeenCalled();
    expect(body.results).toEqual([
      {
        candidateId: "cand-2",
        success: false,
        error: "No open jobs found for your clients",
      },
    ]);
  });

  it("returns 428 when a target job JD Base is unapproved", async () => {
    const linksBuilder = createMockQueryBuilder({
      data: [{ client_organisation_id: "client-1" }],
    });
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "agency_clients") return linksBuilder;
        throw new Error(`Unexpected server table: ${table}`);
      }),
    });

    const candidateLookupBuilder = createMockQueryBuilder({
      data: {
        id: "cand-3",
        name: "Pending Candidate",
        email: "pending@example.com",
        phone: null,
        cv_url:
          "https://example.supabase.co/storage/v1/object/public/candidate-cvs/cvs/pending.pdf",
        resume_url: null,
      },
    });
    const pipelineBuilder = createMockQueryBuilder({
      data: [{ job_id: "job-unapproved" }],
    });
    const jobsBuilder = createMockQueryBuilder({
      data: [
        {
          id: "job-unapproved",
          title: "Software Engineer",
          description: "Build products",
          location: "Bengaluru",
          status: "open",
          compensation_min: 10,
          compensation_max: 20,
          organisation_id: "client-1",
        },
      ],
    });

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return {
            select: vi.fn(() => candidateLookupBuilder),
            update: vi.fn(),
          };
        }
        if (table === "pipeline_candidates") return pipelineBuilder;
        if (table === "jobs") return jobsBuilder;
        throw new Error(`Unexpected admin table: ${table}`);
      }),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(),
        })),
      },
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);
    mockIsJdBaseApproved.mockResolvedValueOnce(false);

    const req = new Request("http://localhost/api/agency/reprocess-candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidateIds: ["cand-3"] }),
    });

    const { POST } = await import("@/app/api/agency/reprocess-candidates/route");
    const res = await POST(req as never);

    expect(res.status).toBe(428);
    const body = await res.json();
    expect(body.error).toContain("JD Base awaiting hiring manager approval");
  });
});
