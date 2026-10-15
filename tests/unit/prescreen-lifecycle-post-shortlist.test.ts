import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSessionById = vi.fn();
const mockUpdateSession = vi.fn();
const mockGetApprovedJdBase = vi.fn();
const mockGetGatingQuestions = vi.fn();
const mockDispatchPrescreenMessage = vi.fn();
const mockFinalizeTimeout = vi.fn();
const mockSendTemplateMessage = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { full_name: "Test Candidate", name: null } }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendTemplateMessage: (...args: unknown[]) => mockSendTemplateMessage(...args),
}));

vi.mock("@/lib/screening/org-whatsapp-screening", () => ({
  getOrgDisplayName: async () => "Masai School",
}));

vi.mock("@/lib/prescreen/repository", () => ({
  getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
  updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  getApprovedJdBase: (...args: unknown[]) => mockGetApprovedJdBase(...args),
  getGatingQuestions: (...args: unknown[]) => mockGetGatingQuestions(...args),
}));

vi.mock("@/lib/prescreen/dispatch", () => ({
  dispatchPrescreenMessage: (...args: unknown[]) => mockDispatchPrescreenMessage(...args),
}));

vi.mock("@/lib/prescreen/channel-router", () => ({
  finalizeTimeout: (...args: unknown[]) => mockFinalizeTimeout(...args),
}));

import { processPrescreenReminder, processPrescreenTimeout } from "@/lib/prescreen/lifecycle";

const payload = {
  sessionId: "sess-1",
  jobId: "job-1",
  candidateId: "cand-1",
  jdBaseDocumentId: "jd-1",
  channel: "whatsapp" as const,
  phone: "919999999999",
  questionsSentAtIso: new Date().toISOString(),
};

describe("post-shortlist prescreen lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApprovedJdBase.mockResolvedValue({ roleTitle: "Lead Business Analyst" });
    mockGetGatingQuestions.mockResolvedValue([
      { id: "q1" },
      { id: "q2" },
      { id: "q3" },
      { id: "q4" },
      { id: "q5" },
    ]);
    mockUpdateSession.mockResolvedValue(undefined);
    mockDispatchPrescreenMessage.mockResolvedValue(true);
    mockFinalizeTimeout.mockResolvedValue(undefined);
  });

  it("sends consent reminder when awaiting_consent", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_consent",
      stage: "post_shortlist",
      reminder_sent_at: null,
    });

    const result = await processPrescreenReminder(payload);
    expect(result).toEqual({ sent: true });
    expect(mockDispatchPrescreenMessage).toHaveBeenCalledWith(
      { channel: "whatsapp", phone: payload.phone },
      expect.stringContaining("you were shortlisted for Lead Business Analyst"),
    );
    // The consent reminder quotes the REAL configured question count, not a hardcoded 7.
    expect(mockDispatchPrescreenMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("5 quick YES/NO questions"),
    );
    expect(mockGetGatingQuestions).toHaveBeenCalledWith(
      expect.anything(),
      payload.jdBaseDocumentId,
      "post_shortlist",
    );
    // State must stay awaiting_consent so the candidate's YES is routed through
    // the consent branch, not recorded as a question answer.
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({
        state: "awaiting_consent",
        reminder_sent_at: expect.any(String),
      }),
    );
  });

  it("sends question reminder when awaiting_reply", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_reply",
      stage: "post_shortlist",
      reminder_sent_at: null,
    });

    await processPrescreenReminder(payload);
    expect(mockDispatchPrescreenMessage).toHaveBeenCalledWith(
      { channel: "whatsapp", phone: payload.phone },
      expect.stringContaining("reply YES or NO to the last question"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "reminded" }),
    );
  });

  it("apply-stage awaiting_consent reminder asks for consent (no phantom 'previous question') and keeps state", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_consent",
      stage: "apply",
      reminder_sent_at: null,
    });

    const result = await processPrescreenReminder(payload);
    expect(result).toEqual({ sent: true });
    const body = mockDispatchPrescreenMessage.mock.calls[0][1] as string;
    expect(body).not.toContain("previous question");
    expect(body).toContain("reply YES when you're ready");
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({
        state: "awaiting_consent",
        reminder_sent_at: expect.any(String),
      }),
    );
  });

  it("apply-stage awaiting_reply reminder still nudges the previous question and marks reminded", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_reply",
      stage: "apply",
      reminder_sent_at: null,
    });

    await processPrescreenReminder(payload);
    expect(mockDispatchPrescreenMessage).toHaveBeenCalledWith(
      { channel: "whatsapp", phone: payload.phone },
      expect.stringContaining("previous question"),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "reminded" }),
    );
  });

  it("does not mark the session reminded when dispatch and template both fail", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_reply",
      stage: "post_shortlist",
      reminder_sent_at: null,
    });
    mockDispatchPrescreenMessage.mockResolvedValue(false);
    mockSendTemplateMessage.mockResolvedValue({ success: false, error: "outbound_throttled" });

    const result = await processPrescreenReminder(payload);
    expect(result).toEqual({ sent: false });
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("falls back to the stage template when the free-form reminder fails", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_reply",
      stage: "post_shortlist",
      reminder_sent_at: null,
    });
    mockDispatchPrescreenMessage.mockResolvedValue(false);
    mockSendTemplateMessage.mockResolvedValue({ success: true });

    const result = await processPrescreenReminder(payload);
    expect(result).toEqual({ sent: true });
    expect(mockSendTemplateMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: "th_shortlisted",
        phoneNumber: payload.phone,
      }),
    );
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({
        state: "awaiting_consent",
        reminder_sent_at: expect.any(String),
      }),
    );
  });

  it("sends nothing when the session was completed (e.g. candidate texted STOP)", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "complete",
      stage: "post_shortlist",
      reminder_sent_at: null,
    });

    const result = await processPrescreenReminder(payload);
    expect(result).toEqual({ sent: false });
    expect(mockDispatchPrescreenMessage).not.toHaveBeenCalled();
    expect(mockSendTemplateMessage).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("ignores reminder timers scheduled by a previous round", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_consent",
      stage: "post_shortlist",
      reminder_sent_at: null,
      questions_sent_at: "2026-07-08T10:13:00.000Z", // re-invited after the timer was scheduled
    });

    const result = await processPrescreenReminder({
      ...payload,
      questionsSentAtIso: "2026-07-07T09:55:00.000Z",
    });
    expect(result).toEqual({ sent: false });
    expect(mockDispatchPrescreenMessage).not.toHaveBeenCalled();
    expect(mockUpdateSession).not.toHaveBeenCalled();
  });

  it("ignores timeout timers scheduled by a previous round", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_consent",
      stage: "post_shortlist",
      questions_sent_at: "2026-07-08T10:13:00.000Z",
    });

    const result = await processPrescreenTimeout({
      ...payload,
      questionsSentAtIso: "2026-07-07T09:55:00.000Z",
    });
    expect(result).toEqual({ resolved: false });
    expect(mockUpdateSession).not.toHaveBeenCalled();
    expect(mockDispatchPrescreenMessage).not.toHaveBeenCalled();
  });

  it("does not gate or score on post-shortlist timeout", async () => {
    mockGetSessionById.mockResolvedValue({
      id: "sess-1",
      state: "awaiting_reply",
      stage: "post_shortlist",
    });

    const result = await processPrescreenTimeout(payload);
    expect(result).toEqual({ resolved: true });
    expect(mockFinalizeTimeout).not.toHaveBeenCalled();
    expect(mockUpdateSession).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "complete" }),
    );
    expect(mockDispatchPrescreenMessage).toHaveBeenCalledWith(
      { channel: "whatsapp", phone: payload.phone },
      expect.stringContaining("didn't get all your screening answers"),
    );
  });
});
