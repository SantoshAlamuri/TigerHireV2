/** Node env: importing public-apply must not load browser-guarded SDKs via fitscore side effects. */
// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Capture every enqueue call so we can assert the cv-parse-retry job is pushed
// on Phase 2 failure, and that it carries candidateId + jobId.
const enqueueSpy = vi.fn().mockResolvedValue({});
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => enqueueSpy(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/observability/metrics", () => ({
  logAgentRun: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendApplicationReceivedTemplate: vi.fn().mockResolvedValue({ success: true }),
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/lib/services/resend", () => ({
  sendApplicationConfirmation: vi.fn().mockResolvedValue({ skipped: true }),
}));

vi.mock("@/lib/acknowledgements/notifier", () => ({
  buildCandidateAcknowledgementPlan: vi.fn().mockResolvedValue({ enabled: false, channels: [] }),
}));

vi.mock("@/lib/acknowledgements/dedupe", () => ({
  buildAckDedupeKey: () => "dedupe-key",
}));

vi.mock("@/lib/acknowledgements/log", () => ({
  logCandidateAcknowledgementAttempt: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/acknowledgements/idempotency", () => ({
  hasSentAttemptWithinWindow: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/applications/cooling-off", () => ({
  assertNotInOrgCoolingOff: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/prescreen/start-gate", () => ({
  startPrescreenGateBestEffort: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/screening/job-screening", () => ({
  fetchActiveScreeningQuestions: vi.fn().mockResolvedValue([]),
  evaluateScreeningAnswers: vi.fn(),
}));

vi.mock("@/lib/screening/application-screening-answers", () => ({
  upsertApplicationScreeningAnswers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/referrers/application-referral-merge", () => ({
  mergeApplicationReferralFields: () => ({
    referral_link_id: null,
    direct_referrer_id: null,
    parent_referrer_id: null,
  }),
}));

vi.mock("@/lib/agents/candidate-dedup", () => ({
  findExistingCandidate: vi.fn().mockResolvedValue(null),
  normalizeEmailForCandidate: (v: string | null | undefined) => v ?? null,
  normalizePhoneForCandidate: (v: string | null | undefined) => v ?? null,
}));

// Force Phase 2 (parseCandidate -> parseResumeFileWithClaude) to throw so the
// catch path that should enqueue cv-parse-retry fires.
const parseResumeFileWithClaude = vi.fn();
vi.mock("@/lib/agents/cv-parser", () => ({
  parseResumeFileWithClaude: (...args: unknown[]) => parseResumeFileWithClaude(...args),
  parseCVWithClaude: vi.fn(),
}));

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  enqueuePendingJdApprovalPair: vi.fn().mockResolvedValue(undefined),
  isJdBaseApproved: vi.fn().mockResolvedValue(false),
  JD_BASE_NOT_APPROVED_MESSAGE: "JD base not approved",
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn(),
  },
  numericOverallFromFitScoreServiceResult: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/agents/ghostbuster", () => ({
  calculateGhostRiskScore: () => 0,
}));

vi.mock("@/lib/agents/vouch", () => ({
  startVouchFlow: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/config/env", () => ({
  env: { fitscoreBatchConcurrency: 4 },
}));

/**
 * Minimal Supabase mock that's enough to walk processPublicApplication
 * from validate-target through Phase 1 (save) into Phase 2.
 */
type TestJob = {
  id: string;
  organisation_id: string;
  status: string;
  list_on_public_job_board: boolean;
  is_active: boolean;
};
let testJobs: TestJob[];
let adminMocks: ReturnType<typeof buildSupabaseMock>[] = [];

function buildSupabaseMock() {
  const insertedCandidateId = "cand-new-1";
  const jobsListBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: { id: "job-1", organisation_id: "org-1", status: "open" },
      error: null,
    }),
    then: undefined,
  };

  // Each table returns a fresh chainable builder with whatever resolve
  // semantics that callsite needs. Awaiting the builder resolves to
  // { data: [], error: null } by default.
  const builderFor = (table: string) => {
    const b: Record<string, unknown> = {
      data: null,
      error: null,
    };
    const chain = [
      "select",
      "insert",
      "update",
      "upsert",
      "delete",
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "in",
      "is",
      "or",
      "not",
      "ilike",
      "overlaps",
      "order",
      "limit",
      "range",
      "head",
      "csv",
    ];
    for (const m of chain) b[m] = vi.fn().mockReturnValue(b);

    if (table === "jobs") {
      const filters: Array<[string, unknown]> = [];
      b.eq = vi.fn((key: string, value: unknown) => {
        filters.push([key, value]);
        return b;
      });
      const rows = () =>
        testJobs.filter((job) =>
          filters.every(
            ([key, value]) => (job as unknown as Record<string, unknown>)[key] === value,
          ),
        );
      b.maybeSingle = vi.fn(async () => ({ data: rows()[0] ?? null, error: null }));
      b.single = b.maybeSingle;
      b.then = (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null });
    } else if (table === "candidates") {
      // .insert(...).select("id").single() returns the new id.
      b.single = vi.fn().mockResolvedValue({
        data: { id: insertedCandidateId },
        error: null,
      });
      b.maybeSingle = vi.fn().mockResolvedValue({
        data: { id: insertedCandidateId },
        error: null,
      });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    } else if (table === "pipeline_candidates") {
      b.single = vi.fn().mockResolvedValue({ data: null, error: null });
      b.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    } else if (table === "applications") {
      // upsert(...).select("id").limit(1) returns rows
      b.single = vi.fn().mockResolvedValue({ data: { id: "app-1" }, error: null });
      b.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: [{ id: "app-1" }], error: null });
    } else if (table === "pipeline_stages") {
      b.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "stage-1" }, error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    } else if (table === "fit_scores") {
      b.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
    } else {
      b.single = vi.fn().mockResolvedValue({ data: null, error: null });
      b.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      b.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    }
    return b;
  };

  return {
    insertedCandidateId,
    jobsListBuilder,
    from: vi.fn((table: string) => builderFor(table)),
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: { path: "ok" }, error: null }),
        createSignedUrl: vi
          .fn()
          .mockResolvedValue({ data: { signedUrl: "https://example/signed" }, error: null }),
        download: vi.fn().mockResolvedValue({
          data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
          error: null,
        }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => {
    const admin = buildSupabaseMock();
    adminMocks.push(admin);
    return admin;
  },
}));

beforeEach(() => {
  testJobs = [
    {
      id: "job-1",
      organisation_id: "org-1",
      status: "open",
      list_on_public_job_board: true,
      is_active: true,
    },
  ];
  adminMocks = [];
  enqueueSpy.mockClear();
  parseResumeFileWithClaude.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("processPublicApplication Phase 2 orphan retry", () => {
  it("enqueues cv-parse-retry with candidateId + jobId when Phase 2 parse fails", async () => {
    parseResumeFileWithClaude.mockRejectedValue(new Error("Claude 5xx"));

    const { processPublicApplication } = await import("@/lib/agents/public-apply");
    const result = await processPublicApplication({
      fileBuffer: Buffer.from("dummy pdf"),
      fileName: "resume.pdf",
      contentType: "application/pdf",
      organisationId: "org-1",
      jobId: "job-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+15555550000",
      source: "apply_page",
    });

    expect(result.parsingPending).toBe(true);

    // Yield once so the void-async enqueue dispatch can run before we assert.
    await new Promise((r) => setImmediate(r));

    expect(enqueueSpy).toHaveBeenCalled();
    const cvRetryCall = enqueueSpy.mock.calls.find((call) => call[0] === "cv-parse-retry");
    expect(cvRetryCall).toBeDefined();
    const payload = cvRetryCall?.[1] as {
      candidateId?: string;
      jobId?: string | null;
      organisationId?: string;
      source?: string;
    };
    expect(payload?.candidateId).toBe(result.candidateId);
    expect(payload?.jobId).toBe("job-1");
    expect(payload?.organisationId).toBe("org-1");
    expect(payload?.source).toMatch(/phase2/);
  });

  it("does NOT enqueue a retry when the parse failed permanently (schema rejection) — it would only re-bill", async () => {
    const { CvParseValidationError } = await import("@/lib/agents/cv-parse-repair");
    parseResumeFileWithClaude.mockRejectedValue(
      new CvParseValidationError([{ path: "canonical_skills", message: "too many" }]),
    );

    const { processPublicApplication } = await import("@/lib/agents/public-apply");
    const result = await processPublicApplication({
      fileBuffer: Buffer.from("dummy pdf"),
      fileName: "resume.pdf",
      contentType: "application/pdf",
      organisationId: "org-1",
      jobId: "job-1",
      name: "Jane Doe",
      email: "jane@example.com",
      phone: "+15555550000",
      source: "apply_page",
    });

    expect(result.parsingPending).toBe(false);
    expect(result.scoringFailed).toBe(true);
    await new Promise((r) => setImmediate(r));
    expect(enqueueSpy.mock.calls.some((call) => call[0] === "cv-parse-retry")).toBe(false);

    // The recruiter sees "failed", not a forever-"pending" ghost row.
    const failedWrite = adminMocks
      .flatMap((admin) => admin.from.mock.results.map((r) => r.value))
      .flatMap((builder) => (builder.update as ReturnType<typeof vi.fn>).mock.calls)
      .find((call) => (call[0] as Record<string, unknown>)?.processing_status === "failed");
    expect(failedWrite).toBeDefined();
  });
});

describe("public application eligibility", () => {
  it.each([
    { list_on_public_job_board: false },
    { is_active: false },
    { status: "closed" },
    { organisation_id: "other-org" },
  ])(
    "rejects unavailable target before storage, candidate writes or screening: %j",
    async (changes) => {
      testJobs[0] = { ...testJobs[0], ...changes };
      const { processPublicApplication } = await import("@/lib/agents/public-apply");
      await expect(
        processPublicApplication({
          fileBuffer: Buffer.from("resume"),
          fileName: "resume.pdf",
          organisationId: "org-1",
          jobId: "job-1",
          source: "agency_upload",
          requirePublicJob: false,
        }),
      ).rejects.toMatchObject({ code: "public_apply_invalid_target" });
      expect(adminMocks.every((admin) => admin.storage.from.mock.calls.length === 0)).toBe(true);
      expect(
        adminMocks.flatMap((admin) => admin.from.mock.calls).every(([table]) => table === "jobs"),
      ).toBe(true);
      expect(parseResumeFileWithClaude).not.toHaveBeenCalled();
    },
  );

  it("matches an untargeted public application only to active public jobs during intake and scoring", async () => {
    testJobs.push(
      { ...testJobs[0], id: "private", list_on_public_job_board: false },
      { ...testJobs[0], id: "inactive", is_active: false },
      { ...testJobs[0], id: "closed", status: "closed" },
      { ...testJobs[0], id: "other-org", organisation_id: "org-2" },
    );
    parseResumeFileWithClaude.mockResolvedValue({
      parsed: { full_name: "Jane" },
      tokens: { input: 0, output: 0 },
      model: "mock",
    });
    const { processPublicApplication } = await import("@/lib/agents/public-apply");
    await processPublicApplication({
      fileBuffer: Buffer.from("resume"),
      fileName: "resume.pdf",
      organisationId: "org-1",
      skipCandidateAcknowledgement: true,
    });
    const appWrites = adminMocks.flatMap((admin) =>
      admin.from.mock.results
        .filter((_, index) => admin.from.mock.calls[index][0] === "applications")
        .flatMap((result) => (result.value.upsert as ReturnType<typeof vi.fn>).mock.calls),
    );
    expect(appWrites).toHaveLength(1);
    expect(appWrites[0][0]).toMatchObject({ job_id: "job-1" });
    const { enqueuePendingJdApprovalPair } = await import("@/lib/fitscore/pending-jd-approval");
    expect(enqueuePendingJdApprovalPair).toHaveBeenCalledTimes(1);
    expect(enqueuePendingJdApprovalPair).toHaveBeenCalledWith(
      expect.anything(),
      "job-1",
      "cand-new-1",
    );
  });
});

describe("retryCvParse idempotency", () => {
  it("no-ops when cv_parsed_at is already set for the candidate", async () => {
    // Build a Supabase admin whose candidates row has cv_parsed_at set, so the
    // retry function should bail before any download or Claude call.
    const candidateBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "cand-A",
          name: "Old Name",
          email: "old@example.com",
          phone: null,
          cv_url: "https://supa.co/storage/v1/object/sign/candidate-cvs/old.pdf?token=x",
          resume_url: null,
          cv_parsed_at: "2025-01-01T00:00:00Z",
        },
        error: null,
      }),
    };
    const supabaseDownload = vi.fn();
    const supabaseUpdate = vi.fn();

    const admin = {
      from: vi.fn((table: string) => {
        if (table === "candidates") {
          return {
            ...candidateBuilder,
            update: vi.fn().mockReturnValue({
              eq: supabaseUpdate.mockResolvedValue({ data: null, error: null }),
            }),
          };
        }
        return candidateBuilder;
      }),
      storage: {
        from: vi.fn().mockReturnValue({
          download: supabaseDownload,
        }),
      },
    };

    const { retryCvParse } = await import("@/lib/agents/cv-parse-retry");
    const result = await retryCvParse(admin as never, {
      candidateId: "cand-A",
      jobId: "job-1",
      organisationId: "org-1",
      source: "phase2_failed",
    });

    expect(result.skipped).toBe(true);
    expect(result.skipReason).toBe("already_parsed");
    expect(parseResumeFileWithClaude).not.toHaveBeenCalled();
    expect(supabaseDownload).not.toHaveBeenCalled();
    expect(supabaseUpdate).not.toHaveBeenCalled();
  });

  it("processes the candidate when cv_parsed_at is null", async () => {
    const updateEq = vi.fn().mockResolvedValue({ data: null, error: null });
    const candidateUpdate = vi.fn().mockReturnValue({ eq: updateEq });
    const candidateBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "cand-B",
          name: "Pending",
          email: null,
          phone: null,
          cv_url: "https://supa.co/storage/v1/object/sign/candidate-cvs/new.pdf?token=y",
          resume_url: null,
          cv_parsed_at: null,
        },
        error: null,
      }),
      update: candidateUpdate,
    };

    const downloadFn = vi.fn().mockResolvedValue({
      data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer },
      error: null,
    });

    const admin = {
      from: vi.fn(() => candidateBuilder),
      storage: { from: vi.fn().mockReturnValue({ download: downloadFn }) },
    };

    parseResumeFileWithClaude.mockResolvedValueOnce({
      parsed: {
        full_name: "Pending",
        email: null,
        phone: null,
        current_title: "Engineer",
        current_company: "Acme",
        canonical_skills: ["ts"],
        years_experience: 5,
        location_city: "BLR",
        availability: null,
        seniority_level: "mid",
        salary_expectation_min: null,
        salary_expectation_max: null,
      },
      rawTextForStorage: "raw",
      tokens: { input: 1, output: 1 },
      model: "claude",
      parseQuality: 1,
      parseMethod: "text_extraction",
    });

    const { retryCvParse } = await import("@/lib/agents/cv-parse-retry");
    const result = await retryCvParse(admin as never, {
      candidateId: "cand-B",
      jobId: null,
      organisationId: "org-1",
      source: "phase2_failed",
    });

    expect(parseResumeFileWithClaude).toHaveBeenCalledOnce();
    expect(downloadFn).toHaveBeenCalledOnce();
    expect(result.parsed).toBe(true);
    expect(result.skipped).toBeUndefined();
  });
});
