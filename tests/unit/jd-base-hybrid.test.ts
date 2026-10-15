import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobData } from "@/lib/fitscore/types";

const mockCallClaude = vi.fn();
const mockIsStructuredJdEnabled = vi.fn();
const mockSyncJdRequirements = vi.fn();
const mockUpsertPrescreen = vi.fn();

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/feature-flags/cascade", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isStructuredJdEnabled: (...args: unknown[]) => mockIsStructuredJdEnabled(...args),
}));

vi.mock("@/lib/jd-base/sync-requirements", () => ({
  syncJdRequirementsFromStructuredJd: (...args: unknown[]) => mockSyncJdRequirements(...args),
}));

vi.mock("@/lib/prescreen/derive", () => ({
  upsertPrescreenQuestionsForJdBase: (...args: unknown[]) => mockUpsertPrescreen(...args),
}));

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "00000000-0000-4000-8000-000000000901",
    job_id: "00000000-0000-4000-8000-000000000101",
    role_title: "Backend Engineer",
    company: "TigerHire Client",
    context: "Context for backend hiring dimensions and role outcomes.",
    weights: { backend_depth: 50, system_design: 30, communication: 20 },
    score_floor: 15,
    fit_thresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
    extraction_additions: null,
    ideal_candidate_profile: {
      summary: "Ideal profile summary for this role and team.",
      must_haves: ["Node.js", "System design", "APIs"],
      nice_to_haves: ["AWS"],
      years_range: "4-8 years",
      benchmarks: { backend_depth: "Owns production backend systems." },
    },
    approved_by: "00000000-0000-4000-8000-000000000777",
    approved_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeFeedbackTemplatesBuilder() {
  const limit = vi.fn().mockResolvedValue({ data: [], error: null });
  const afterSecondEq = { limit };
  const afterFirstEq = { eq: vi.fn().mockReturnValue(afterSecondEq) };
  const afterSelect = { eq: vi.fn().mockReturnValue(afterFirstEq) };
  return {
    select: vi.fn().mockReturnValue(afterSelect),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
}

function makeSupabase(row = makeRow()) {
  const builder: Record<string, unknown> = {
    select: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    maybeSingle: vi.fn(),
  };
  (builder.select as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.upsert as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.update as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.eq as ReturnType<typeof vi.fn>).mockReturnValue(builder);
  (builder.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: row, error: null });
  (builder.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: row, error: null });

  const feedbackBuilder = makeFeedbackTemplatesBuilder();

  return {
    supabase: {
      from: vi.fn((table: string) => {
        if (table === "feedback_form_templates") return feedbackBuilder;
        return builder;
      }),
    },
    builder,
  };
}

const job: JobData = {
  id: "00000000-0000-4000-8000-000000000101",
  title: "Backend Engineer",
  description: "",
  location: null,
  status: "open",
  compensation_min: null,
  compensation_max: null,
  organisation_id: "00000000-0000-4000-8000-000000000102",
  skills_required: [],
};

describe("hybrid jd-base persistence behavior", () => {
  beforeEach(() => {
    mockCallClaude.mockReset();
    mockIsStructuredJdEnabled.mockReset();
    mockSyncJdRequirements.mockReset();
    mockUpsertPrescreen.mockReset();
    mockIsStructuredJdEnabled.mockResolvedValue(false);
    mockSyncJdRequirements.mockResolvedValue(undefined);
    mockUpsertPrescreen.mockResolvedValue(undefined);
  });

  it("generateJdBaseDocument clears approval fields on upsert", async () => {
    mockCallClaude.mockResolvedValue({
      text: JSON.stringify({
        context: "Context generated from JD and role constraints.",
        weights: { backend_depth: 50, system_design: 30, communication: 20 },
        ideal_candidate_profile: {
          summary: "Generated ideal profile for backend hiring decisions.",
          must_haves: ["Node.js", "System design", "API design"],
          nice_to_haves: ["AWS", "Observability"],
          years_range: "4-8 years",
          benchmarks: { backend_depth: "Leads backend architecture independently." },
        },
      }),
    });
    const { supabase, builder } = makeSupabase(makeRow({ approved_by: null, approved_at: null }));

    const { generateJdBaseDocument } = await import("@/lib/fitscore/hybrid/jd-base");
    await generateJdBaseDocument(supabase as never, job);

    const payload = (builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.approved_by).toBeNull();
    expect(payload.approved_at).toBeNull();
  });

  it("upsertJdBaseFromTemplate always writes ideal_candidate_profile (LLM fallback safe)", async () => {
    mockCallClaude.mockRejectedValue(new Error("temporary model failure"));
    const { supabase, builder } = makeSupabase(makeRow({ approved_by: null, approved_at: null }));

    const { upsertJdBaseFromTemplate } = await import("@/lib/fitscore/hybrid/jd-base");
    await upsertJdBaseFromTemplate(supabase as never, job, {
      id: "template-1",
      category: "Technology & Engineering",
      roleTitle: "Backend Engineer",
      weights: { backend_depth: 50, system_design: 30, communication: 20 },
      signals: "Node.js, APIs, distributed systems",
      redFlags: "No production ownership",
      scoreFloor: 15,
      fitThresholds: { strong: 78, good: 60, moderate: 40, weak: 25 },
      keywords: ["backend", "node"],
    });

    const payload = (builder.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    const profile = payload.ideal_candidate_profile as Record<string, unknown>;
    expect(profile).toBeTruthy();
    expect(typeof profile.summary).toBe("string");
    expect(Array.isArray(profile.must_haves)).toBe(true);
    expect((profile.must_haves as unknown[]).length).toBeGreaterThanOrEqual(3);
    expect(typeof profile.years_range).toBe("string");
  });

  it("updateJdBaseDocument resets approval on context and ideal profile changes", async () => {
    const { supabase, builder } = makeSupabase(makeRow({ approved_by: null, approved_at: null }));
    const { updateJdBaseDocument } = await import("@/lib/fitscore/hybrid/jd-base");

    await updateJdBaseDocument(supabase as never, job.id, {
      context: "Updated role context requiring fresh approval.",
      idealCandidateProfile: {
        summary: "Updated profile summary for new hiring criteria.",
        must_haves: ["Node.js", "System design", "Distributed systems"],
        nice_to_haves: ["AWS"],
        years_range: "5-9 years",
        benchmarks: { backend_depth: "Expert backend execution at scale." },
      },
    });

    const payload = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.approved_by).toBeNull();
    expect(payload.approved_at).toBeNull();
  });

  it("updateJdBaseDocument keeps approval when substantive fields are unchanged (saveDraft-then-approve retry)", async () => {
    // The wizard always PUTs a full draft right before Approve. When nothing actually
    // changed (e.g. retry after a timed-out approve), approval must survive — otherwise
    // the retry re-approves and triggers a duplicate full rescore.
    const row = makeRow(); // approved
    const { supabase, builder } = makeSupabase(row);
    const { updateJdBaseDocument } = await import("@/lib/fitscore/hybrid/jd-base");

    await updateJdBaseDocument(supabase as never, job.id, {
      weights: { backend_depth: 50, system_design: 30, communication: 20 },
      context: row.context as string,
      idealCandidateProfile: row.ideal_candidate_profile as Record<string, unknown>,
      structuredJd: null,
      scoreFloor: 15,
    });

    const payload = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("approved_by");
    expect(payload).not.toHaveProperty("approved_at");
  });

  it("updateJdBaseDocument resets approval when weights actually change", async () => {
    const { supabase, builder } = makeSupabase(makeRow());
    const { updateJdBaseDocument } = await import("@/lib/fitscore/hybrid/jd-base");

    await updateJdBaseDocument(supabase as never, job.id, {
      weights: { backend_depth: 70, system_design: 30 },
    });

    const payload = (builder.update as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<
      string,
      unknown
    >;
    expect(payload.approved_by).toBeNull();
    expect(payload.approved_at).toBeNull();
  });

  it("jdBasePatchChangesApprovalFields is key-order-insensitive and detects real changes", async () => {
    const { jdBasePatchChangesApprovalFields, getJdBaseByJobId } =
      await import("@/lib/fitscore/hybrid/jd-base");
    const { supabase } = makeSupabase(makeRow());
    const existing = await getJdBaseByJobId(supabase as never, job.id);

    // Same weights in a different key order -> no change.
    expect(
      jdBasePatchChangesApprovalFields(existing, {
        weights: { communication: 20, backend_depth: 50, system_design: 30 },
      }),
    ).toBe(false);
    // Dropped dimension -> change.
    expect(
      jdBasePatchChangesApprovalFields(existing, {
        weights: { backend_depth: 70, system_design: 30 },
      }),
    ).toBe(true);
    // Non-substantive fields alone (thresholds/scoreFloor/roleTitle) -> no change.
    expect(
      jdBasePatchChangesApprovalFields(existing, {
        scoreFloor: 30,
        fitThresholds: { strong: 80, good: 60, moderate: 40, weak: 25 },
        roleTitle: "Renamed",
      }),
    ).toBe(false);
    // Context edit -> change.
    expect(jdBasePatchChangesApprovalFields(existing, { context: "Different context." })).toBe(
      true,
    );
  });

  describe("approveJdBase jd_requirements sync (structured JD flag on)", () => {
    const userId = "00000000-0000-4000-8000-000000000777";
    const orgId = "00000000-0000-4000-8000-000000000102";

    it("falls back to the ideal profile when structured_jd is null (does not wipe jd_requirements)", async () => {
      mockIsStructuredJdEnabled.mockResolvedValue(true);
      const row = makeRow({ structured_jd: null });
      const { supabase } = makeSupabase(row);

      const { approveJdBase } = await import("@/lib/fitscore/hybrid/jd-base");
      await approveJdBase(supabase as never, job.id, userId, orgId);

      expect(mockSyncJdRequirements).toHaveBeenCalledOnce();
      const [, jdBaseId, structured] = mockSyncJdRequirements.mock.calls[0] as [
        unknown,
        string,
        Record<string, unknown>,
      ];
      expect(jdBaseId).toBe(row.id);
      expect(structured.must_haves).toEqual(["Node.js", "System design", "APIs"]);
      expect(structured.nice_to_haves).toEqual(["AWS"]);
      expect(structured.need_to_haves).toEqual([]);
    });

    it("syncs the stored structured JD when present", async () => {
      mockIsStructuredJdEnabled.mockResolvedValue(true);
      const structuredJd = {
        role_basics: { title: "Backend Engineer" },
        responsibilities: ["Own reliability"],
        must_haves: ["Kotlin"],
        need_to_haves: ["Kafka"],
        nice_to_haves: ["GraphQL"],
      };
      const { supabase } = makeSupabase(makeRow({ structured_jd: structuredJd }));

      const { approveJdBase } = await import("@/lib/fitscore/hybrid/jd-base");
      await approveJdBase(supabase as never, job.id, userId, orgId);

      expect(mockSyncJdRequirements).toHaveBeenCalledOnce();
      const structured = mockSyncJdRequirements.mock.calls[0][2] as Record<string, unknown>;
      expect(structured.must_haves).toEqual(["Kotlin"]);
      expect(structured.need_to_haves).toEqual(["Kafka"]);
      expect(structured.nice_to_haves).toEqual(["GraphQL"]);
    });

    it("syncs empty only when both structured JD and ideal profile are absent", async () => {
      mockIsStructuredJdEnabled.mockResolvedValue(true);
      const { supabase } = makeSupabase(
        makeRow({ structured_jd: null, ideal_candidate_profile: null }),
      );

      const { approveJdBase } = await import("@/lib/fitscore/hybrid/jd-base");
      await approveJdBase(supabase as never, job.id, userId, orgId);

      expect(mockSyncJdRequirements).toHaveBeenCalledOnce();
      const structured = mockSyncJdRequirements.mock.calls[0][2] as Record<string, unknown>;
      expect(structured.must_haves).toEqual([]);
      expect(structured.need_to_haves).toEqual([]);
      expect(structured.nice_to_haves).toEqual([]);
    });
  });
});
