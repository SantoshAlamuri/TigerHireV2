/**
 * WhatsApp canonical scoring path (Message + hybrid v2).
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockIsJdBaseApproved = vi.fn();
const mockEnqueuePending = vi.fn();
const mockComputeSingle = vi.fn();
const mockSendApplicationReceived = vi.fn();
const mockSendWhatsAppMessage = vi.fn();

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  enqueuePendingJdApprovalPair: (...args: unknown[]) => mockEnqueuePending(...args),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: (...args: unknown[]) => mockComputeSingle(...args),
  },
  numericOverallFromFitScoreServiceResult: (result: unknown) => {
    if (!result || typeof result !== "object") return null;
    const r = result as Record<string, unknown>;
    if (r.scoring_status === "pending_jd_approval") return null;
    if (typeof r.fitScore === "number") return r.fitScore;
    return null;
  },
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendApplicationReceivedTemplate: (...args: unknown[]) => mockSendApplicationReceived(...args),
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const jobData = {
  id: "job-1",
  title: "QA Engineer",
  description: "Test",
  location: "Remote",
  status: "open",
  compensation_min: null,
  compensation_max: null,
  organisation_id: "org-1",
};

const candidate = {
  id: "cand-1",
  name: "Asha Kumar",
  skills: ["Selenium"],
  experience_years: 4,
  location: "Bangalore",
  intent_score: null,
  resume_url: null,
  updated_at: null,
};

describe("scoreWhatsAppJobForCandidate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendApplicationReceived.mockResolvedValue({ success: true });
    mockSendWhatsAppMessage.mockResolvedValue({ success: true });
  });

  it("unapproved JD Base: queues pending, sends acknowledgement and next steps, does not score", async () => {
    mockIsJdBaseApproved.mockResolvedValue(false);

    const fitScoresBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      fit_scores: fitScoresBuilder,
    });

    const { scoreWhatsAppJobForCandidate } = await import("@/lib/whatsapp/fitscore-routing");

    const result = await scoreWhatsAppJobForCandidate({
      supabase: supabase as never,
      jobId: "job-1",
      jobData,
      candidateId: "cand-1",
      candidate,
      applicationAck: {
        phone: "+919999999999",
        candidateName: "Asha",
        jobTitle: "QA Engineer",
        companyName: "Acme Ltd",
      },
    });

    expect(result).toEqual({ status: "pending_jd_approval" });
    expect(mockEnqueuePending).toHaveBeenCalledWith(supabase, "job-1", "cand-1");
    expect(mockSendApplicationReceived).toHaveBeenCalledWith({
      phone: "+919999999999",
      candidateName: "Asha",
      jobTitle: "QA Engineer",
      companyName: "Acme Ltd",
      applicationId: undefined,
    });
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("your FitScore is queued"),
    );
    expect(mockComputeSingle).not.toHaveBeenCalled();
    expect(fitScoresBuilder.insert).not.toHaveBeenCalled();
  });

  it("approved JD Base: scores via FitScoreService and reads hybrid fit_scores row", async () => {
    mockIsJdBaseApproved.mockResolvedValue(true);
    mockComputeSingle.mockResolvedValue({ fitScore: 72, fitLabel: "Good Fit" });

    const fitScoresBuilder = createMockQueryBuilder({
      data: { overall_score: 72, scoring_version: 2 },
    });
    const supabase = createMockSupabase({
      fit_scores: fitScoresBuilder,
    });

    const { scoreWhatsAppJobForCandidate } = await import("@/lib/whatsapp/fitscore-routing");

    const result = await scoreWhatsAppJobForCandidate({
      supabase: supabase as never,
      jobId: "job-1",
      jobData,
      candidateId: "cand-1",
      candidate,
    });

    expect(result).toMatchObject({
      status: "scored",
      overallScore: 72,
      band: "Good Fit",
    });
    expect(mockComputeSingle).toHaveBeenCalledWith(supabase, "job-1", "cand-1", {
      onUnapprovedJdBase: "queue_pending",
      source: "upload",
    });
    expect(mockSendApplicationReceived).not.toHaveBeenCalled();
    expect(mockEnqueuePending).not.toHaveBeenCalled();
  });
});
