// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NonRetriableError } from "inngest";

const parseResumeFileWithClaude = vi.fn();
vi.mock("@/lib/agents/cv-parser", () => ({
  parseResumeFileWithClaude: (...a: unknown[]) => parseResumeFileWithClaude(...a),
}));

const warn = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: { computeSingle: vi.fn() },
  numericOverallFromFitScoreServiceResult: () => null,
}));
vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  enqueuePendingJdApprovalPair: vi.fn(),
  isJdBaseApproved: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/agents/ghostbuster", () => ({ calculateGhostRiskScore: () => 0 }));
vi.mock("@/lib/agents/candidate-dedup", () => ({
  normalizePhoneForCandidate: (v: unknown) => (v ? String(v) : null),
}));
vi.mock("@/lib/candidates/normalize-contact-detail", () => ({
  normalizeContactDetail: (v: unknown) => (v ? String(v) : null),
}));

import { CvParseValidationError } from "@/lib/agents/cv-parse-repair";
import { retryCvParse } from "@/lib/agents/cv-parse-retry";

function buildAdmin() {
  const updates: Array<Record<string, unknown>> = [];
  const candidates = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: {
        id: "cand-1",
        name: "DHANANJAY SINGH",
        email: null,
        phone: null,
        cv_url: "https://x.supabase.co/storage/v1/object/sign/candidate-cvs/cvs/a.pdf?token=t",
        resume_url: null,
        cv_parsed_at: null,
      },
    }),
    update: vi.fn((payload: Record<string, unknown>) => {
      updates.push(payload);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    }),
  };
  return {
    updates,
    from: vi.fn(() => candidates),
    storage: {
      from: vi.fn(() => ({
        download: vi
          .fn()
          .mockResolvedValue({ data: { arrayBuffer: async () => new Uint8Array([1]).buffer } }),
      })),
    },
  };
}

beforeEach(() => {
  parseResumeFileWithClaude.mockReset();
  warn.mockClear();
});

describe("retryCvParse — stop paying for deterministic parse failures", () => {
  it("marks the candidate failed and raises NonRetriableError on a schema rejection", async () => {
    parseResumeFileWithClaude.mockRejectedValue(
      new CvParseValidationError([{ path: "canonical_skills", message: "too many" }]),
    );
    const admin = buildAdmin();

    await expect(
      retryCvParse(admin as never, { candidateId: "cand-1", organisationId: "org-1" }),
    ).rejects.toBeInstanceOf(NonRetriableError);

    expect(admin.updates).toEqual([expect.objectContaining({ processing_status: "failed" })]);
    expect(warn).toHaveBeenCalledWith(
      "cv_parse_retry_failed_permanently",
      expect.objectContaining({ candidateId: "cand-1" }),
    );
    expect(parseResumeFileWithClaude).toHaveBeenCalledTimes(1);
  });

  it("re-throws transient provider errors unchanged so Inngest can retry them", async () => {
    parseResumeFileWithClaude.mockRejectedValue(new Error("529 overloaded"));
    const admin = buildAdmin();

    await expect(
      retryCvParse(admin as never, { candidateId: "cand-1", organisationId: "org-1" }),
    ).rejects.toThrow("529 overloaded");
    await expect(
      retryCvParse(admin as never, { candidateId: "cand-1", organisationId: "org-1" }),
    ).rejects.not.toBeInstanceOf(NonRetriableError);
    expect(admin.updates).toEqual([]);
  });
});
