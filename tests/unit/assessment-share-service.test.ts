import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockCreateSupabaseAdmin = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/resend", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }),
}));

describe("submitAssessmentByToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when neither submissionText nor submissionUrl is provided", async () => {
    const { submitAssessmentByToken } = await import("@/lib/services/assessment-share");
    const result = await submitAssessmentByToken({
      token: "tok",
      submittedVia: "web",
    });
    expect(result).toEqual({
      ok: false,
      status: 400,
      error: "Either submissionText or submissionUrl is required",
    });
  });

  it("returns 404 when token is not found", async () => {
    const admin = {
      from: vi.fn(() => createMockQueryBuilder({ data: null, error: null })),
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);
    const { submitAssessmentByToken } = await import("@/lib/services/assessment-share");
    const result = await submitAssessmentByToken({
      token: "missing",
      submissionText: "answer",
      submittedVia: "web",
    });
    expect(result).toEqual({
      ok: false,
      status: 404,
      error: "Assessment link not found",
    });
  });

  it("returns 403 when requester phone does not match candidate phone", async () => {
    const assessmentsBuilder = createMockQueryBuilder({
      data: {
        id: "asmt-1",
        application_id: "app-1",
        status: "pending",
        deadline_at: "2099-01-01T00:00:00.000Z",
      },
    });
    const applicationsBuilder = createMockQueryBuilder({
      data: { candidate_id: "cand-1" },
    });
    const candidatesBuilder = createMockQueryBuilder({
      data: { phone: "+91 9999999999" },
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "assessments") return assessmentsBuilder;
        if (table === "applications") return applicationsBuilder;
        if (table === "candidates") return candidatesBuilder;
        return createMockQueryBuilder();
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { submitAssessmentByToken } = await import("@/lib/services/assessment-share");
    const result = await submitAssessmentByToken({
      token: "tok",
      submissionText: "answer",
      submittedVia: "whatsapp",
      requesterPhone: "+91 8888888888",
    });
    expect(result).toEqual({
      ok: false,
      status: 403,
      error: "This assessment link is not mapped to your WhatsApp number",
    });
  });

  it("returns ok true when pending assessment is submitted successfully", async () => {
    const assessmentsBuilder = createMockQueryBuilder({
      data: {
        id: "asmt-1",
        application_id: "app-1",
        status: "pending",
        deadline_at: "2099-01-01T00:00:00.000Z",
      },
    });
    assessmentsBuilder.update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: "asmt-1" },
              error: null,
            }),
          }),
        }),
      }),
    });
    const admin = {
      from: vi.fn((table: string) => {
        if (table === "assessments") return assessmentsBuilder;
        return createMockQueryBuilder();
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { submitAssessmentByToken } = await import("@/lib/services/assessment-share");
    const result = await submitAssessmentByToken({
      token: "tok",
      submissionUrl: "https://example.com/solution",
      submittedVia: "web",
    });
    expect(result).toEqual({ ok: true, assessmentId: "asmt-1" });
  });
});
