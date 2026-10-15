import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockCreateSupabaseAdmin = vi.fn();
const mockHasAnyEnterpriseRole = vi.fn();
const mockGetOrgSettingsPermissions = vi.fn();
const mockHasSettingsCapability = vi.fn();
const mockCreateNotification = vi.fn();
const mockValidateCronSecret = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role?: string }, ...roles: string[]) => roles.includes(ctx.role ?? ""),
  ensureOrganisationAccess: (
    ctx: { role?: string; organisationId?: string | null },
    orgId: string | null | undefined,
  ) => {
    if (ctx.role === "super_admin") return null;
    if (!ctx.organisationId || !orgId || ctx.organisationId !== orgId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    return null;
  },
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
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleZodError: () => Response.json({ error: "Invalid request payload" }, { status: 422 }),
  handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/enterprise-roles", () => ({
  hasAnyEnterpriseRole: (...args: unknown[]) => mockHasAnyEnterpriseRole(...args),
}));

vi.mock("@/lib/settings/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings/permissions")>();
  return {
    ...actual,
    getOrgSettingsPermissions: (...args: unknown[]) => mockGetOrgSettingsPermissions(...args),
    hasSettingsCapability: (...args: unknown[]) => mockHasSettingsCapability(...args),
  };
});

vi.mock("@/lib/services/notifications", () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (...args: unknown[]) => mockValidateCronSecret(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/audit/hiring-offer-audit", () => ({
  recordHiringOfferAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/audit/client-ip", () => ({
  getRequestClientIp: () => "127.0.0.1",
}));

const { mockStartOfferFinanceReviewRound } = vi.hoisted(() => ({
  mockStartOfferFinanceReviewRound: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/workflows/offer-finance-workflow", () => ({
  completeActiveOfferFinanceStage: vi
    .fn()
    .mockResolvedValue({ instanceId: "wi-1", stageId: "ws-1" }),
  startOfferFinanceReviewRound: (...args: unknown[]) => mockStartOfferFinanceReviewRound(...args),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/offers/void-offer-envelope", () => ({
  fireAndForgetVoidOfferEnvelope: vi.fn(),
}));

const { mockCheckCompensationBand, mockNotifyBandExceptionApprovers } = vi.hoisted(() => ({
  mockCheckCompensationBand: vi.fn(),
  mockNotifyBandExceptionApprovers: vi.fn(),
}));

vi.mock("@/lib/offers/compensation-band-check", () => ({
  checkCompensationBand: (...args: unknown[]) => mockCheckCompensationBand(...args),
  /** Must call `mockCheckCompensationBand`; real `resolveOfferBandMetadata` closes over real `checkCompensationBand`. */
  resolveOfferBandMetadata: async (
    supabase: unknown,
    params: {
      organisationId: string;
      bandId?: string | null;
      compensationJson: unknown;
      bandExceptionReason?: string | null;
    },
  ) => {
    const bandCheck = await mockCheckCompensationBand(supabase, {
      organisationId: params.organisationId,
      bandId: params.bandId,
      compensationJson: params.compensationJson,
    });
    const trimmedReason = (params.bandExceptionReason ?? "").trim();
    if (bandCheck.result === "outside_band") {
      if (!trimmedReason) {
        const b = bandCheck.band;
        if (!b || bandCheck.deviation === undefined) {
          return {
            ok: false as const,
            status: 400,
            body: {
              error: "Compensation is outside the selected band; a reason is required.",
            },
          };
        }
        return {
          ok: false as const,
          status: 400,
          body: {
            error: "compensation_outside_band",
            band: {
              label: b.label,
              min: b.min_amount,
              max: b.max_amount,
              currency: b.currency,
            },
            deviation: Math.round((bandCheck.deviation ?? 0) * 100) / 100,
            requiresReason: true,
          },
        };
      }
      return {
        ok: true as const,
        bandStatus: "exception_pending",
        bandExceptionReason: trimmedReason,
      };
    }
    if (bandCheck.result === "within_band") {
      return { ok: true as const, bandStatus: "within_band", bandExceptionReason: null };
    }
    return {
      ok: true as const,
      bandStatus: bandCheck.result,
      bandExceptionReason: null,
    };
  },
}));

vi.mock("@/lib/approvals/notify-band-exception-offer-approval", () => ({
  notifyBandExceptionApprovers: (...args: unknown[]) => mockNotifyBandExceptionApprovers(...args),
}));

const { mockNotifyHiringManagerOfferDraft } = vi.hoisted(() => ({
  mockNotifyHiringManagerOfferDraft: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/approvals/notify-hm-offer-draft", () => ({
  notifyHiringManagerOfferDraft: (...args: unknown[]) => mockNotifyHiringManagerOfferDraft(...args),
}));

/** Server client: application + pipeline rows so draft offer POST passes stage gate. */
function supabaseForOfferDraftPost() {
  return createMockSupabase({
    applications: createMockQueryBuilder({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        candidate_id: "cand-1",
        job_id: "job-1",
        jobs: {
          organisation_id: "org-1",
          hiring_manager_id: "hm-1",
          hiring_request_id: "33333333-3333-4333-8333-333333333333",
          hiring_requests: {
            id: "33333333-3333-4333-8333-333333333333",
            status: "approved",
            req_code: "REQ-GEN-2026-001",
          },
        },
      },
    }),
    pipeline_candidates: createMockQueryBuilder({
      data: [
        {
          id: "pc-1",
          stage_id: "11111111-1111-4111-8111-111111111112",
          status: "in_progress",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    }),
    pipeline_stages: createMockQueryBuilder({
      data: { stage_name: "Compensation & Offer" },
    }),
  });
}

/** Legacy job with no hiring requisition link (used with OFFER_SKIP_HIRING_REQUEST_LINK_GATE). */
function supabaseForOfferDraftPostNoHiringRequest() {
  return createMockSupabase({
    applications: createMockQueryBuilder({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        candidate_id: "cand-1",
        job_id: "job-1",
        jobs: {
          organisation_id: "org-1",
          hiring_manager_id: "hm-1",
          hiring_request_id: null,
          hiring_requests: null,
        },
      },
    }),
    pipeline_candidates: createMockQueryBuilder({
      data: [
        {
          id: "pc-1",
          stage_id: "11111111-1111-4111-8111-111111111112",
          status: "in_progress",
          updated_at: "2026-04-01T00:00:00Z",
        },
      ],
    }),
    pipeline_stages: createMockQueryBuilder({
      data: { stage_name: "Compensation & Offer" },
    }),
  });
}

/** Admin rows for `offer_pdf_templates` so POST /api/offers can resolve `letter_variables`. */
function offerPdfTemplatesLetterVarsBuilder() {
  return createMockQueryBuilder({
    data: {
      id: "22222222-2222-4222-8222-222222222222",
      custom_merge_field_defs: [],
    },
  });
}

describe("offers routes", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      userId: "user-1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockHasAnyEnterpriseRole.mockResolvedValue(true);
    mockGetOrgSettingsPermissions.mockResolvedValue({});
    mockHasSettingsCapability.mockReturnValue(true);
    mockCreateNotification.mockResolvedValue(undefined);
    mockValidateCronSecret.mockResolvedValue(true);
    mockStartOfferFinanceReviewRound.mockClear();
    mockCheckCompensationBand.mockResolvedValue({ result: "no_band" });
    mockNotifyBandExceptionApprovers.mockResolvedValue(undefined);
    mockNotifyHiringManagerOfferDraft.mockClear();
  });

  it("POST /api/offers returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/offers paginates enterprise list with limit/offset", async () => {
    const offersBuilder = createMockQueryBuilder({
      data: [
        {
          id: "offer-1",
          application_id: "app-1",
          created_at: "2026-04-18T00:00:00.000Z",
          applications: { candidate_id: "cand-1", job_id: "job-1", jobs: null },
          offer_approvals: [],
          offer_candidate_responses: [],
        },
        {
          id: "offer-2",
          application_id: "app-2",
          created_at: "2026-04-17T00:00:00.000Z",
          applications: { candidate_id: "cand-2", job_id: "job-2", jobs: null },
          offer_approvals: [],
          offer_candidate_responses: [],
        },
      ],
    });
    mockCreateSupabaseServerClient.mockResolvedValue(
      createMockSupabase({
        offers: offersBuilder,
      }),
    );

    const { GET } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers?limit=1&offset=0");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      offers: Array<{ id: string }>;
      pagination: { limit: number; offset: number; hasMore: boolean };
    };
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]?.id).toBe("offer-1");
    expect(body.pagination).toEqual({ limit: 1, offset: 0, hasMore: true });
  });

  it("POST /api/offers returns 403 when capability is disabled", async () => {
    const supabase = supabaseForOfferDraftPost();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockHasSettingsCapability.mockReturnValue(false);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("POST /api/offers returns 400 for malformed JSON body", async () => {
    const supabase = createMockSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/offers creates offer and returns 201", async () => {
    const supabase = supabaseForOfferDraftPost();
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "draft",
          role_title: "Software Engineer",
        },
      }),
      offer_pdf_templates: offerPdfTemplatesLetterVarsBuilder(),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockNotifyHiringManagerOfferDraft).toHaveBeenCalledTimes(1);
  });

  it("POST /api/offers returns 400 when job has no approved hiring requisition (gate on)", async () => {
    const supabase = supabaseForOfferDraftPostNoHiringRequest();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("not linked");
  });

  it("POST /api/offers creates when OFFER_SKIP_HIRING_REQUEST_LINK_GATE=true and job has no requisition", async () => {
    vi.stubEnv("OFFER_SKIP_HIRING_REQUEST_LINK_GATE", "true");
    const supabase = supabaseForOfferDraftPostNoHiringRequest();
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-legacy-1",
          status: "draft",
          role_title: "Software Engineer",
        },
      }),
      offer_pdf_templates: offerPdfTemplatesLetterVarsBuilder(),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const { recordHiringOfferAuditEvent } = await import("@/lib/audit/hiring-offer-audit");
    expect(recordHiringOfferAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          hiring_request_gate_skipped: true,
        }),
      }),
    );
  });

  it("POST /api/offers ignores injected pending_finance status and creates draft", async () => {
    const supabase = supabaseForOfferDraftPost();
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-legacy-status-attempt",
          status: "draft",
          role_title: "Software Engineer",
        },
      }),
      offer_pdf_templates: offerPdfTemplatesLetterVarsBuilder(),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
        status: "pending_finance",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { offer?: { status?: string } };
    expect(body.offer?.status).toBe("draft");
  });

  it("POST /api/offers returns 400 for unknown offer PDF template", async () => {
    const supabase = supabaseForOfferDraftPost();
    const admin = createMockSupabase({
      offer_pdf_templates: createMockQueryBuilder({ data: null }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1200000 },
        offerPdfTemplateId: "22222222-2222-4222-8222-222222222222",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("POST /api/offers/[id]/finance returns 409 when offer not pending", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: { id: "offer-1", status: "approved", created_by: "user-2", organisation_id: "org-1" },
      }),
      profiles: createMockQueryBuilder({
        data: { organisation_id: "org-1", role: "finance" },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/finance/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(409);
  });

  it("POST /api/offers/[id]/finance returns 400 for malformed JSON body", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "pending_finance",
          created_by: "user-2",
          organisation_id: "org-1",
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/finance/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(400);
  });

  it("POST /api/offers/[id]/finance requires comment on rejection", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "pending_finance",
          created_by: "user-2",
          organisation_id: "org-1",
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/finance/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "rejected" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(422);
  });

  it("POST /api/offers/[id]/finance returns 403 for cross-org offer", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "pending_finance",
          created_by: "user-2",
          organisation_id: "org-2",
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/finance/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/finance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST /api/offers/[id]/send returns 409 if offer is not approved", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "pending_finance",
          organisation_id: "org-1",
          expires_at: null,
          applications: { candidate_id: "cand-1" },
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/send/route");
    const res = await POST(new Request("http://localhost/api/offers/offer-1/send"), {
      params: Promise.resolve({ id: "offer-1" }),
    });
    expect(res.status).toBe(409);
  });

  it("POST /api/offers/[id]/response returns 403 for non-owner candidate", async () => {
    const server = createMockSupabase({
      candidates: createMockQueryBuilder({
        data: { id: "cand-1", user_id: "other-user" },
      }),
    });
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "sent",
          expires_at: null,
          created_by: "recruiter-1",
          applications: { candidate_id: "cand-1" },
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(server);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/response/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "accept" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(403);
  });

  it("POST /api/offers/[id]/response returns 400 for malformed JSON", async () => {
    const { POST } = await import("@/app/api/offers/[id]/response/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(400);
  });

  it("POST /api/offers/[id]/response decline sets declined", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "cand-user-1",
      role: "candidate_pro",
      organisationId: null,
    });
    const server = createMockSupabase({
      candidates: createMockQueryBuilder({
        data: { id: "cand-1", user_id: "cand-user-1" },
      }),
    });
    const sentOffer = {
      id: "offer-1",
      status: "sent",
      expires_at: null,
      created_by: "recruiter-1",
      organisation_id: "org-1",
      document_content: null,
      applications: { candidate_id: "cand-1" },
    };
    const updatedRow = { ...sentOffer, status: "declined", role_title: "Software Engineer" };
    let offersInitialSelectDone = false;
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return createMockQueryBuilder({
            data: { id: "cand-1", user_id: "cand-user-1" },
          });
        }
        if (table === "offers") {
          if (!offersInitialSelectDone) {
            offersInitialSelectDone = true;
            return createMockQueryBuilder({ data: sentOffer });
          }
          return createMockQueryBuilder({ data: updatedRow });
        }
        if (table === "offer_candidate_responses") return createMockQueryBuilder({ data: null });
        if (table === "employee_roles") return createMockQueryBuilder({ data: [] });
        return createMockQueryBuilder();
      }),
    };

    mockCreateSupabaseServerClient.mockResolvedValue(server);
    mockCreateSupabaseAdmin.mockReturnValue(admin as ReturnType<typeof createMockSupabase>);

    const { POST } = await import("@/app/api/offers/[id]/response/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/response", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: "decline", comment: "Not a fit" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { offer?: { status?: string } };
    expect(body.offer?.status).toBe("declined");
    expect(mockStartOfferFinanceReviewRound).not.toHaveBeenCalled();
  });

  it("POST /api/offers/[id]/return-to-draft sets negotiating to draft for recruiter", async () => {
    const negotOffer = {
      id: "offer-1",
      status: "negotiating",
      organisation_id: "org-1",
      application_id: "app-1",
      role_title: "Software Engineer",
    };
    const draftRow = { ...negotOffer, status: "draft" };
    let offerFromCalls = 0;
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") {
          offerFromCalls += 1;
          if (offerFromCalls === 1) {
            return createMockQueryBuilder({ data: negotOffer });
          }
          return createMockQueryBuilder({ data: draftRow });
        }
        return createMockQueryBuilder();
      }),
    };
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(
      admin as unknown as ReturnType<typeof createMockSupabase>,
    );

    const { POST } = await import("@/app/api/offers/[id]/return-to-draft/route");
    const req = new NextRequest("http://localhost/api/offers/offer-1/return-to-draft", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "offer-1" }) });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { offer?: { status?: string } };
    expect(body.offer?.status).toBe("draft");
  });

  it("POST /api/offers returns 400 compensation_outside_band without reason", async () => {
    mockCheckCompensationBand.mockResolvedValue({
      result: "outside_band",
      band: {
        id: "b1",
        organisation_id: "org-1",
        label: "IC3",
        currency: "INR",
        min_amount: 1_000_000,
        max_amount: 1_500_000,
        is_active: true,
      },
      offeredAmount: 1_800_000,
      currency: "INR",
      deviation: 20,
    });
    const supabase = supabaseForOfferDraftPost();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(createMockSupabase());

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1_800_000 },
        bandId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; requiresReason?: boolean };
    expect(body.error).toBe("compensation_outside_band");
    expect(body.requiresReason).toBe(true);
  });

  it("POST /api/offers outside band with reason returns 201 and exception_pending", async () => {
    mockCheckCompensationBand.mockResolvedValue({
      result: "outside_band",
      band: {
        id: "b1",
        organisation_id: "org-1",
        label: "IC3",
        currency: "INR",
        min_amount: 1_000_000,
        max_amount: 1_500_000,
        is_active: true,
      },
      offeredAmount: 1_800_000,
      currency: "INR",
      deviation: 20,
    });
    const supabase = supabaseForOfferDraftPost();
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "draft",
          role_title: "Software Engineer",
          band_status: "exception_pending",
        },
      }),
      offer_pdf_templates: offerPdfTemplatesLetterVarsBuilder(),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1_800_000 },
        bandId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        bandExceptionReason: "Critical hire — approved by VP",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { offer?: { band_status?: string } };
    expect(body.offer?.band_status).toBe("exception_pending");
  });

  it("POST /api/offers within band returns 201 with within_band", async () => {
    mockCheckCompensationBand.mockResolvedValue({
      result: "within_band",
      band: {
        id: "b1",
        organisation_id: "org-1",
        label: "IC3",
        currency: "INR",
        min_amount: 1_000_000,
        max_amount: 1_500_000,
        is_active: true,
      },
      offeredAmount: 1_200_000,
      currency: "INR",
      deviation: 0,
    });
    const supabase = supabaseForOfferDraftPost();
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "draft",
          role_title: "Software Engineer",
          band_status: "within_band",
        },
      }),
      offer_pdf_templates: offerPdfTemplatesLetterVarsBuilder(),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/route");
    const req = new NextRequest("http://localhost/api/offers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        applicationId: "11111111-1111-4111-8111-111111111111",
        roleTitle: "Software Engineer",
        startDate: "2026-04-01",
        compensation: { ctc: 1_200_000 },
        bandId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as { offer?: { band_status?: string } };
    expect(body.offer?.band_status).toBe("within_band");
  });

  it("POST /api/offers/[id]/send returns 202 when band exception_pending", async () => {
    const admin = createMockSupabase({
      offers: createMockQueryBuilder({
        data: {
          id: "offer-1",
          status: "approved",
          expires_at: null,
          organisation_id: "org-1",
          application_id: "app-1",
          role_title: "Engineer",
          band_status: "exception_pending",
          created_by: "user-2",
          compensation_json: {},
          notes: null,
          offer_pdf_template_id: null,
          applications: { candidate_id: "cand-1" },
        },
      }),
    });
    mockCreateSupabaseServerClient.mockResolvedValue(createMockSupabase());
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { POST } = await import("@/app/api/offers/[id]/send/route");
    const res = await POST(
      new NextRequest("http://localhost/api/offers/offer-1/send", { method: "POST" }),
      { params: Promise.resolve({ id: "offer-1" }) },
    );
    expect(res.status).toBe(202);
    expect(mockNotifyBandExceptionApprovers).toHaveBeenCalled();
  });

  it("GET /api/cron/offer-expiry returns 401 for invalid cron secret", async () => {
    mockValidateCronSecret.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cron/offer-expiry/route");
    const req = new NextRequest("http://localhost/api/cron/offer-expiry");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("GET /api/cron/offer-expiry expires sent offers and returns count", async () => {
    const offersBuilder = createMockQueryBuilder({ data: [{ id: "o1" }, { id: "o2" }] });
    const approvalDelBuilder = createMockQueryBuilder({ data: [] });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "offers") return offersBuilder;
        if (table === "approval_tokens") return approvalDelBuilder;
        return createMockQueryBuilder();
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin as ReturnType<typeof createMockSupabase>);
    const { GET } = await import("@/app/api/cron/offer-expiry/route");
    const req = new NextRequest("http://localhost/api/cron/offer-expiry");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.expired).toBe(2);
    expect(body.approvalTokensDeleted).toBe(0);
  });
});
