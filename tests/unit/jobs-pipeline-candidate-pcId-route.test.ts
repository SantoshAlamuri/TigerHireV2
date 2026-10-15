import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildRequest, candidateCtx, fakeUuid, recruiterCtx } from "../helpers";

const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockGetAuthContext = vi.fn();
const mockAssertJobAccess = vi.fn();
const mockValidateOrigin = vi.fn();
const mockUpsertHiringOutcome = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
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
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

vi.mock("@/lib/constants/agency-stages", () => ({
  AGENCY_STAGE_KEYS: ["sourced", "introduced", "interviewing", "offer", "placed", "rejected"],
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationStatusUpdate: vi.fn(),
  sendPipelineStageUpdateEmail: vi.fn(),
}));

vi.mock("@/lib/placement-fee/record-offer-billing", () => ({
  recordOfferAcceptedBillingEvent: vi.fn(),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  notifyCandidateShortlisted: vi.fn(),
  notifyCandidateRejected: vi.fn(),
  notifyCandidateOffer: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn(),
}));

vi.mock("@/lib/services/hiring-outcomes", () => ({
  upsertHiringOutcome: (...args: unknown[]) => mockUpsertHiringOutcome(...args),
}));

vi.mock("@/lib/agents/payout-trigger", () => ({
  triggerPayoutIfEligible: vi.fn(),
}));

vi.mock("@/lib/services/pipeline-action-signals", () => ({
  recordPipelineActionSignals: vi.fn(),
}));

vi.mock("@/lib/whatsapp/referrer-notifications", () => ({
  sendReferrerOfferNotification: vi.fn(),
  sendReferrerRejectionNotification: vi.fn(),
}));

vi.mock("@/lib/analytics/log-pipeline-stage-transition", () => ({
  logPipelineStageTransition: vi.fn(),
}));

function createPipelineCandidateBuilder(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.eq = vi.fn().mockReturnValue(builder);
  builder.single = vi.fn().mockResolvedValue({ data, error });
  builder.update = vi.fn().mockReturnValue(builder);
  builder.delete = vi.fn().mockReturnValue(builder);
  builder.then = vi.fn((resolve: (v: unknown) => void) => resolve({ data: null, error: null }));
  return builder;
}

describe("/api/jobs/[id]/pipeline/candidates/[pcId]", () => {
  const jobId = fakeUuid("job");
  const pcId = fakeUuid("pc");
  const candidateId = fakeUuid("candidate");

  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
    mockAssertJobAccess.mockResolvedValue({ job: { id: jobId, organisation_id: "org-1" } });
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {};
        builder.update = vi.fn().mockReturnValue(builder);
        builder.eq = vi.fn().mockReturnValue(builder);
        builder.then = vi.fn((resolve: (v: unknown) => void) =>
          resolve({ data: null, error: null }),
        );
        return builder;
      }),
    });
    mockUpsertHiringOutcome.mockResolvedValue(undefined);
  });

  it("PATCH returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/jobs/[id]/pipeline/candidates/[pcId]/route");

    const res = await PATCH(
      buildRequest(`http://localhost/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
        method: "PATCH",
        body: {},
      }) as never,
      { params: Promise.resolve({ id: jobId, pcId }) },
    );

    expect(res.status).toBe(401);
  });

  it("PATCH returns 403 for forbidden role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/jobs/[id]/pipeline/candidates/[pcId]/route");

    const res = await PATCH(
      buildRequest(`http://localhost/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
        method: "PATCH",
        body: {},
      }) as never,
      { params: Promise.resolve({ id: jobId, pcId }) },
    );

    expect(res.status).toBe(403);
  });

  it("PATCH returns 404 when pipeline candidate does not exist", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => createPipelineCandidateBuilder(null, { message: "not found" })),
    });
    const { PATCH } = await import("@/app/api/jobs/[id]/pipeline/candidates/[pcId]/route");

    const res = await PATCH(
      buildRequest(`http://localhost/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
        method: "PATCH",
        body: {},
      }) as never,
      { params: Promise.resolve({ id: jobId, pcId }) },
    );

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "Pipeline candidate not found" });
  });

  it("PATCH returns 200 for empty update body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const pipelineCandidate = {
      id: pcId,
      job_id: jobId,
      candidate_id: candidateId,
      stage_id: null,
      status: "in_progress",
    };
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => createPipelineCandidateBuilder(pipelineCandidate)),
    });
    const { PATCH } = await import("@/app/api/jobs/[id]/pipeline/candidates/[pcId]/route");

    const res = await PATCH(
      buildRequest(`http://localhost/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
        method: "PATCH",
        body: {},
      }) as never,
      { params: Promise.resolve({ id: jobId, pcId }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ pipeline_candidate: pipelineCandidate });
  });

  it("DELETE returns 200 on successful deletion", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const pipelineCandidate = { id: pcId, job_id: jobId, candidate_id: candidateId };
    mockCreateSupabaseServerClient.mockResolvedValue({
      from: vi.fn(() => createPipelineCandidateBuilder(pipelineCandidate)),
    });
    const { DELETE } = await import("@/app/api/jobs/[id]/pipeline/candidates/[pcId]/route");

    const res = await DELETE(
      buildRequest(`http://localhost/api/jobs/${jobId}/pipeline/candidates/${pcId}`, {
        method: "DELETE",
      }) as never,
      { params: Promise.resolve({ id: jobId, pcId }) },
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({ deleted: true });
    expect(mockUpsertHiringOutcome).toHaveBeenCalledOnce();
  });
});
