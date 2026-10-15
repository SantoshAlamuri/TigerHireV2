import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
  }),
}));

const mockSendWhatsAppMessage = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const mockUpdateSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/whatsapp/sessions", () => ({
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  withSessionCAS: vi.fn(async (phone: string, mutate: (s: unknown) => unknown) => {
    const outcome = await mutate({ version: 0, context: {} });
    if (!outcome) return null;
    const o = outcome as { state: string; context: Record<string, unknown>; extras?: unknown };
    if (o.extras === undefined) await mockUpdateSession(phone, o.state, o.context);
    else await mockUpdateSession(phone, o.state, o.context, o.extras);
    return { session_state: o.state, context: o.context };
  }),
  SessionConflictError: class SessionConflictError extends Error {},
}));

const mockApplicationServiceCreate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: {
    create: (...args: unknown[]) => mockApplicationServiceCreate(...args),
  },
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("createApplicationFromWhatsApp", () => {
  beforeEach(() => {
    mockAdminFrom.mockReset();
    mockSendWhatsAppMessage.mockReset();
    mockUpdateSession.mockReset();
    mockApplicationServiceCreate.mockReset();
  });

  it("asks candidate to re-send CV when candidate id is missing", async () => {
    const { createApplicationFromWhatsApp } = await import("@/lib/whatsapp/application-bridge");

    await createApplicationFromWhatsApp("+91 99999 99999", 1, {});

    expect(mockSendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(mockUpdateSession).toHaveBeenCalledWith("+91 99999 99999", "cv_requested", {});
  });

  it("prompts valid range when choice exceeds top matches", async () => {
    const fitScoreBuilder = createMockQueryBuilder({
      data: [
        {
          id: "fit-1",
          overall_score: 87,
          skills_score: 80,
          job_id: "job-1",
          jobs: { id: "job-1", title: "SDE", status: "open", organisations: { name: "Acme" } },
        },
      ],
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreBuilder;
      return createMockQueryBuilder();
    });

    const { createApplicationFromWhatsApp } = await import("@/lib/whatsapp/application-bridge");
    await createApplicationFromWhatsApp("+919999999999", 3, { candidate_id: "cand-1" });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("Reply a number from 1 to 1"),
    );
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("does not apply when selected role is closed", async () => {
    const fitScoreBuilder = createMockQueryBuilder({
      data: [
        {
          id: "fit-1",
          overall_score: 85,
          skills_score: 78,
          job_id: "job-1",
          jobs: {
            id: "job-1",
            title: "Designer",
            status: "closed",
            organisations: { name: "Studio Co" },
          },
        },
      ],
    });
    const applicationsBuilder = createMockQueryBuilder({ data: null });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreBuilder;
      if (table === "applications") return applicationsBuilder;
      return createMockQueryBuilder();
    });

    const { createApplicationFromWhatsApp } = await import("@/lib/whatsapp/application-bridge");
    await createApplicationFromWhatsApp("+919999999999", 1, { candidate_id: "cand-1" });

    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+919999999999",
      expect.stringContaining("no longer accepting applications"),
    );
    expect(applicationsBuilder.insert).not.toHaveBeenCalled();
  });

  it("creates application and confirms recruiter visibility", async () => {
    const fitScoreBuilder = createMockQueryBuilder({
      data: [
        {
          id: "fit-1",
          overall_score: 91,
          skills_score: 88,
          job_id: "job-123",
          jobs: {
            id: "job-123",
            title: "Backend Engineer",
            status: "open",
            organisations: { name: "TigerHire" },
          },
        },
      ],
    });

    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "fit_scores") return fitScoreBuilder;
      return createMockQueryBuilder();
    });

    const { createApplicationFromWhatsApp } = await import("@/lib/whatsapp/application-bridge");
    await createApplicationFromWhatsApp("+91 99999-99999", 1, {
      candidate_id: "cand-42",
      direct_referrer_id: "ref-123",
      parent_referrer_id: "ref-parent-1",
    });

    expect(mockApplicationServiceCreate).toHaveBeenCalledWith(
      expect.any(Object),
      "cand-42",
      expect.objectContaining({
        jobId: "job-123",
        fitScoreId: "fit-1",
        interest: "interested",
        source: "whatsapp",
        directReferrerId: "ref-123",
        parentReferrerId: "ref-parent-1",
      }),
    );
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith(
      "+91 99999-99999",
      expect.stringContaining("sent to the recruiter"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      "919999999999",
      "complete",
      expect.objectContaining({
        candidate_id: "cand-42",
        direct_referrer_id: "ref-123",
        parent_referrer_id: "ref-parent-1",
      }),
    );
  });
});
