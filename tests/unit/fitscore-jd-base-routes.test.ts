import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { agencyCtx, fakeUuid, hiringManagerCtx, recruiterCtx } from "../helpers";

const JOB_ID = fakeUuid("0201");

const mockGetAuthContext = vi.fn();

const jdMocks = vi.hoisted(() => ({
  loadJobForHybridPipeline: vi.fn(),
  getJdBaseByJobId: vi.fn(),
  findBestIndiaTemplate: vi.fn(),
  upsertJdBaseFromTemplate: vi.fn(),
  generateJdBaseDocument: vi.fn(),
  approveJdBase: vi.fn(),
  updateJdBaseDocument: vi.fn(),
  reconcileApprovedJdBaseForJob: vi.fn(),
  enqueue: vi.fn(),
}));

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
    new Response(JSON.stringify({ data }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: () => new Response(JSON.stringify({ error: "Invalid request" }), { status: 422 }),
  handleApiError: (_: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  countPendingJdApprovalForJob: vi.fn().mockResolvedValue(0),
  reconcileApprovedJdBaseForJob: (...args: unknown[]) =>
    jdMocks.reconcileApprovedJdBaseForJob(...args),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => jdMocks.enqueue(...args),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn().mockResolvedValue({
    from: vi.fn(() => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chain;
    }),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn().mockReturnValue({
    from: vi.fn(() => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chain;
    }),
  }),
}));

vi.mock("@/lib/fitscore/hybrid/api-access", () => ({
  loadJobForHybridPipeline: (...args: unknown[]) => jdMocks.loadJobForHybridPipeline(...args),
}));

vi.mock("@/lib/fitscore/hybrid", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/fitscore/hybrid")>();
  return {
    ...actual,
    getJdBaseByJobId: (...args: unknown[]) => jdMocks.getJdBaseByJobId(...args),
    findBestIndiaTemplate: (...args: unknown[]) => jdMocks.findBestIndiaTemplate(...args),
    upsertJdBaseFromTemplate: (...args: unknown[]) => jdMocks.upsertJdBaseFromTemplate(...args),
    generateJdBaseDocument: (...args: unknown[]) => jdMocks.generateJdBaseDocument(...args),
    approveJdBase: (...args: unknown[]) => jdMocks.approveJdBase(...args),
    updateJdBaseDocument: (...args: unknown[]) => jdMocks.updateJdBaseDocument(...args),
  };
});

function mockJob() {
  return {
    id: JOB_ID,
    title: "Backend Engineer",
    description: "",
    location: null,
    status: "open",
    compensation_min: null,
    compensation_max: null,
    organisation_id: fakeUuid("0999"),
    skills_required: [],
  };
}

function mockJdBaseDoc() {
  return {
    id: fakeUuid("0301"),
    jobId: JOB_ID,
    roleTitle: "Backend Engineer",
    company: "TigerHire Client",
    context: "Context for scoring dimensions and expected outcomes.",
    weights: { backend_depth: 40, system_design: 30, communication: 30 },
    scoreFloor: 15,
    fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
    extractionAdditions: null,
    idealCandidateProfile: {
      summary: "A strong backend engineer profile for this team.",
      must_haves: ["Node.js", "System design", "APIs"],
      nice_to_haves: ["AWS"],
      years_range: "4-8 years",
      benchmarks: { backend_depth: "Strong production backend ownership." },
    },
    approvedBy: null,
    approvedAt: null,
  };
}

describe("JD Base route RBAC and generation", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    jdMocks.loadJobForHybridPipeline.mockReset();
    jdMocks.getJdBaseByJobId.mockReset();
    jdMocks.findBestIndiaTemplate.mockReset();
    jdMocks.upsertJdBaseFromTemplate.mockReset();
    jdMocks.generateJdBaseDocument.mockReset();
    jdMocks.approveJdBase.mockReset();
    jdMocks.updateJdBaseDocument.mockReset();
    jdMocks.reconcileApprovedJdBaseForJob.mockReset();
    jdMocks.enqueue.mockReset();
    jdMocks.enqueue.mockResolvedValue({ id: "evt-1" });
  });

  it("allows hiring_manager to GET /api/fitscore/jd-base", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue(mockJdBaseDoc());

    const { GET } = await import("@/app/api/fitscore/jd-base/route");
    const req = new NextRequest(`http://localhost:3000/api/fitscore/jd-base?jobId=${JOB_ID}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
  });

  it("allows agency to approve JD Base", async () => {
    mockGetAuthContext.mockResolvedValue(agencyCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue(mockJdBaseDoc());
    jdMocks.approveJdBase.mockResolvedValue({
      ...mockJdBaseDoc(),
      approvedBy: agencyCtx.userId,
      approvedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fitscore/jd-base/approve/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(jdMocks.approveJdBase).toHaveBeenCalledOnce();
  });

  it("allows hiring_manager to approve JD Base", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue(mockJdBaseDoc());
    jdMocks.approveJdBase.mockResolvedValue({
      ...mockJdBaseDoc(),
      approvedBy: hiringManagerCtx.userId,
      approvedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fitscore/jd-base/approve/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(jdMocks.approveJdBase).toHaveBeenCalledOnce();
  });

  it("uses template-first path in POST /api/fitscore/jd-base", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.findBestIndiaTemplate.mockReturnValue({
      template: {
        id: "template-1",
        category: "Technology & Engineering",
        roleTitle: "Backend Engineer",
        weights: { backend_depth: 50, system_design: 30, communication: 20 },
        signals: "Node.js, APIs",
        scoreFloor: 15,
        fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
        keywords: ["backend", "node"],
      },
      score: 7,
    });
    jdMocks.upsertJdBaseFromTemplate.mockResolvedValue(mockJdBaseDoc());

    const { POST } = await import("@/app/api/fitscore/jd-base/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(jdMocks.upsertJdBaseFromTemplate).toHaveBeenCalledOnce();
    expect(jdMocks.generateJdBaseDocument).not.toHaveBeenCalled();
    expect(jdMocks.findBestIndiaTemplate).toHaveBeenCalledOnce();
    expect(jdMocks.findBestIndiaTemplate.mock.calls[0][0]).toContain("Title: Backend Engineer");
    expect(jdMocks.findBestIndiaTemplate.mock.calls[0][0]).toContain("Description:");
  });

  it("falls back to full generation when no template matches", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.findBestIndiaTemplate.mockReturnValue(null);
    jdMocks.generateJdBaseDocument.mockResolvedValue(mockJdBaseDoc());

    const { POST } = await import("@/app/api/fitscore/jd-base/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(201);
    expect(jdMocks.generateJdBaseDocument).toHaveBeenCalledOnce();
    expect(jdMocks.upsertJdBaseFromTemplate).not.toHaveBeenCalled();
  });

  it("PUT replaces stored weights with the payload — zeroed dimensions stay gone", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    // Existing doc has three dimensions; the recruiter zeroed `c` in the wizard,
    // so the payload only carries {a, b}. The old merge resurrected `c` rescaled.
    jdMocks.getJdBaseByJobId.mockResolvedValue({
      ...mockJdBaseDoc(),
      weights: { a: 50, b: 30, c: 20 },
    });
    jdMocks.updateJdBaseDocument.mockResolvedValue({
      ...mockJdBaseDoc(),
      weights: { a: 70, b: 30 },
    });

    const { PUT } = await import("@/app/api/fitscore/jd-base/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, weights: { a: 70, b: 30 } }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(jdMocks.updateJdBaseDocument).toHaveBeenCalledOnce();
    const patch = jdMocks.updateJdBaseDocument.mock.calls[0][2] as {
      weights: Record<string, number>;
    };
    expect(patch.weights).toEqual({ a: 70, b: 30 });
    expect(patch.weights).not.toHaveProperty("c");
  });

  it("PUT leaves stored weights untouched when the payload omits weights", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue(mockJdBaseDoc());
    jdMocks.updateJdBaseDocument.mockResolvedValue(mockJdBaseDoc());

    const { PUT } = await import("@/app/api/fitscore/jd-base/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID, scoreFloor: 20 }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    const patch = jdMocks.updateJdBaseDocument.mock.calls[0][2] as { weights?: unknown };
    expect(patch.weights).toBeUndefined();
  });

  it("approve enqueues the reconcile instead of running the full rescore inline", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue(mockJdBaseDoc());
    jdMocks.approveJdBase.mockResolvedValue({
      ...mockJdBaseDoc(),
      version: 3,
      approvedBy: hiringManagerCtx.userId,
      approvedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fitscore/jd-base/approve/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    // The heavy LLM rescore must never run inside the request.
    expect(jdMocks.reconcileApprovedJdBaseForJob).not.toHaveBeenCalled();
    expect(jdMocks.enqueue).toHaveBeenCalledOnce();
    expect(jdMocks.enqueue).toHaveBeenCalledWith(
      "jd-base-approval-reconcile",
      { jobId: JOB_ID, approvedByUserId: hiringManagerCtx.userId },
      { id: `jd-base-approval-reconcile:${JOB_ID}:3` },
    );
    const body = (await res.json()) as {
      data: { reconciliation: { queued: boolean }; jdBase: { approvedBy: string | null } };
    };
    expect(body.data.reconciliation.queued).toBe(true);
    expect(body.data.jdBase.approvedBy).toBe(hiringManagerCtx.userId);
  });

  it("approve retry on an already-approved doc does not re-approve and dedupes the enqueue id", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    jdMocks.loadJobForHybridPipeline.mockResolvedValue(mockJob());
    jdMocks.getJdBaseByJobId.mockResolvedValue({
      ...mockJdBaseDoc(),
      version: 3,
      approvedBy: hiringManagerCtx.userId,
      approvedAt: new Date().toISOString(),
    });

    const { POST } = await import("@/app/api/fitscore/jd-base/approve/route");
    const req = new NextRequest("http://localhost:3000/api/fitscore/jd-base/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: JOB_ID }),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(jdMocks.approveJdBase).not.toHaveBeenCalled();
    // Same version -> same event id -> Inngest dedupes the duplicate rescore.
    expect(jdMocks.enqueue).toHaveBeenCalledWith(
      "jd-base-approval-reconcile",
      { jobId: JOB_ID, approvedByUserId: hiringManagerCtx.userId },
      { id: `jd-base-approval-reconcile:${JOB_ID}:3` },
    );
  });
});
