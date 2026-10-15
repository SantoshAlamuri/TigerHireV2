import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the DB/dispatch boundaries; keep gate (resolveGateFromSignals) and
// interactive (parseYesNo) REAL so tests exercise the single resolution path.
vi.mock("@/lib/supabase/admin", () => ({
  // Consent branch looks up jobs.organisation_id for the intro copy.
  createSupabaseAdmin: () =>
    ({
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { organisation_id: "org-1" } }),
          }),
        }),
      }),
    }) as unknown,
}));

vi.mock("@/lib/screening/org-whatsapp-screening", () => ({
  getOrgDisplayName: async () => "Masai School",
}));

vi.mock("@/lib/prescreen/channel-router", () => ({
  finalizePassed: vi.fn(async () => {}),
  finalizeFailed: vi.fn(async () => {}),
  finalizePostShortlistComplete: vi.fn(async () => {}),
}));

vi.mock("@/lib/prescreen/dispatch", () => ({
  dispatchPrescreenMessage: vi.fn(async () => true),
}));

vi.mock("@/lib/prescreen/repository", () => ({
  getActiveWhatsappSession: vi.fn(),
  getApprovedJdBase: vi.fn(),
  getGatingQuestions: vi.fn(),
  getResponses: vi.fn(),
  recordResponse: vi.fn(async () => {}),
  updateSession: vi.fn(async () => {}),
  setApplicationGate: vi.fn(async () => {}),
}));

import { handlePrescreenWhatsappReply } from "@/lib/prescreen/whatsapp-inbound";
import {
  finalizePassed,
  finalizeFailed,
  finalizePostShortlistComplete,
} from "@/lib/prescreen/channel-router";
import { dispatchPrescreenMessage } from "@/lib/prescreen/dispatch";
import {
  getActiveWhatsappSession,
  getApprovedJdBase,
  getGatingQuestions,
  getResponses,
  recordResponse,
  updateSession,
} from "@/lib/prescreen/repository";

const OLD_ISO = "2020-01-01T00:00:00.000Z"; // far past -> never trips the duplicate guard

function makeSession(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "sess-1",
    application_id: "app-1",
    job_id: "job-1",
    candidate_id: "cand-1",
    channel: "whatsapp",
    state: "awaiting_reply",
    current_question_index: 0,
    questions_sent_at: OLD_ISO,
    reminder_sent_at: null,
    completed_at: null,
    created_at: OLD_ISO,
    updated_at: OLD_ISO,
    ...over,
  };
}

function q(id: string, text: string) {
  return {
    id,
    jd_base_document_id: "jd-1",
    requirement_id: id,
    question_text: text,
    answer_type: "yes_no" as const,
    options: null,
    gating: true,
  };
}

const mGetSession = vi.mocked(getActiveWhatsappSession);
const mGetJd = vi.mocked(getApprovedJdBase);
const mGetQuestions = vi.mocked(getGatingQuestions);
const mGetResponses = vi.mocked(getResponses);
const mRecord = vi.mocked(recordResponse);
const mUpdate = vi.mocked(updateSession);
const mPassed = vi.mocked(finalizePassed);
const mFailed = vi.mocked(finalizeFailed);
const mPostShortlistComplete = vi.mocked(finalizePostShortlistComplete);
const mDispatch = vi.mocked(dispatchPrescreenMessage);

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS;
  process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS = "0"; // disable timing guard except where tested
  mGetJd.mockResolvedValue({ id: "jd-1", roleTitle: "Backend Engineer" });
});

describe("handlePrescreenWhatsappReply — non-interception (falls through)", () => {
  it("ignores ambiguous and numeric bodies when the open session is mid-questioning", async () => {
    // Session lookup now happens BEFORE the ambiguity check: awaiting_consent sessions
    // treat any engagement as consent, so the handler must load the session first.
    mGetSession.mockResolvedValue(makeSession() as never);
    expect(
      await handlePrescreenWhatsappReply({ phone: "91", body: "maybe", candidateId: "cand-1" }),
    ).toBe(false);
    expect(
      await handlePrescreenWhatsappReply({ phone: "91", body: "1", candidateId: "cand-1" }),
    ).toBe(false);
    expect(mRecord).not.toHaveBeenCalled();
    expect(mDispatch).not.toHaveBeenCalled();
  });

  it("returns false for empty bodies without any session lookup", async () => {
    expect(await handlePrescreenWhatsappReply({ phone: "91", body: "" })).toBe(false);
    expect(mGetSession).not.toHaveBeenCalled();
  });

  it("falls through when there is no open session (resolved gates are terminal)", async () => {
    mGetSession.mockResolvedValue(null);
    expect(
      await handlePrescreenWhatsappReply({ phone: "91", body: "yes", candidateId: "cand-1" }),
    ).toBe(false);
    expect(mRecord).not.toHaveBeenCalled();
    expect(mPassed).not.toHaveBeenCalled();
    expect(mFailed).not.toHaveBeenCalled();
  });
});

describe("handlePrescreenWhatsappReply — sequential YES/NO", () => {
  it("advances through questions then finalizes PASSED via the resolver", async () => {
    mGetSession.mockResolvedValue(makeSession() as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);

    // First YES: only q1 answered after recording -> not terminal -> advance + prompt q2.
    mGetResponses
      .mockResolvedValueOnce([]) // existing (position)
      .mockResolvedValueOnce([{ question_id: "q1", passed: true }]); // updated

    const r1 = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r1).toBe(true);
    expect(mRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionId: "q1", passed: true }),
    );
    expect(mPassed).not.toHaveBeenCalled();
    expect(mUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ current_question_index: 1 }),
    );
    expect(mDispatch).toHaveBeenCalledTimes(1); // prompt for q2

    vi.clearAllMocks();
    process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS = "0";
    mGetJd.mockResolvedValue({ id: "jd-1", roleTitle: "Backend Engineer" });
    mGetSession.mockResolvedValue(makeSession({ current_question_index: 1 }) as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);

    // Second YES: q1 already answered -> targets q2 -> all answered -> PASSED.
    mGetResponses
      .mockResolvedValueOnce([{ question_id: "q1", passed: true }]) // existing
      .mockResolvedValueOnce([
        { question_id: "q1", passed: true },
        { question_id: "q2", passed: true },
      ]); // updated

    const r2 = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r2).toBe(true);
    expect(mRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionId: "q2", passed: true }),
    );
    expect(mPassed).toHaveBeenCalledTimes(1);
    expect(mFailed).not.toHaveBeenCalled();
  });

  it("a NO short-circuits to FAILED (gate-out, no further questions)", async () => {
    mGetSession.mockResolvedValue(makeSession() as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);
    mGetResponses
      .mockResolvedValueOnce([]) // existing
      .mockResolvedValueOnce([{ question_id: "q1", passed: false }]); // updated

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "no",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ questionId: "q1", passed: false }),
    );
    expect(mFailed).toHaveBeenCalledTimes(1);
    expect(mFailed).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "prescreen_answer_failed" }),
    );
    expect(mPassed).not.toHaveBeenCalled();
    expect(mDispatch).not.toHaveBeenCalled(); // no next-question prompt after gate-out
  });
});

describe("handlePrescreenWhatsappReply — post-shortlist", () => {
  it("a NO gates out immediately (same as apply-stage knockout)", async () => {
    mGetSession.mockResolvedValue(makeSession({ stage: "post_shortlist" }) as never);
    mGetQuestions.mockResolvedValue([
      q("q1", "Office at HSR?"),
      q("q2", "Recruiter call?"),
    ] as never);
    mGetResponses
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ question_id: "q1", passed: false }]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "no",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mFailed).toHaveBeenCalledTimes(1);
    expect(mPostShortlistComplete).not.toHaveBeenCalled();
    expect(mDispatch).not.toHaveBeenCalled();
  });

  it("all YES completes without changing apply gate (post-shortlist complete)", async () => {
    mGetSession.mockResolvedValue(
      makeSession({ stage: "post_shortlist", current_question_index: 1 }) as never,
    );
    mGetQuestions.mockResolvedValue([
      q("q1", "Office at HSR?"),
      q("q2", "Recruiter call?"),
    ] as never);
    mGetResponses.mockResolvedValue([
      { question_id: "q1", passed: true },
      { question_id: "q2", passed: true },
    ]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mPostShortlistComplete).toHaveBeenCalledTimes(1);
    expect(mPassed).not.toHaveBeenCalled();
    expect(mFailed).not.toHaveBeenCalled();
  });
});

describe("handlePrescreenWhatsappReply — consent resume (first unanswered question)", () => {
  it("consent YES with no prior answers prompts Q1 with (1/2) numbering", async () => {
    mGetSession.mockResolvedValue(makeSession({ state: "awaiting_consent" }) as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);
    mGetResponses.mockResolvedValue([]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mRecord).not.toHaveBeenCalled(); // consent is never recorded as an answer
    expect(mUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "awaiting_reply", current_question_index: 0 }),
    );
    expect(mDispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("(1/2) Have 5y exp?"),
    );
  });

  it("consent YES after partial answers prompts the FIRST UNANSWERED question with correct numbering", async () => {
    // Re-nudged partial responder: q1 already answered in the earlier round.
    mGetSession.mockResolvedValue(makeSession({ state: "awaiting_consent" }) as never);
    mGetQuestions.mockResolvedValue([
      q("q1", "Have 5y exp?"),
      q("q2", "Work onsite?"),
      q("q3", "Notice period under 30 days?"),
    ] as never);
    mGetResponses.mockResolvedValue([{ question_id: "q1", passed: true }]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    // The YES is consent, not an answer: nothing recorded, no misattribution.
    expect(mRecord).not.toHaveBeenCalled();
    expect(mPassed).not.toHaveBeenCalled();
    expect(mFailed).not.toHaveBeenCalled();
    expect(mUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({ state: "awaiting_reply", current_question_index: 1 }),
    );
    expect(mDispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("(2/3) Work onsite?"),
    );
  });

  it("consent YES when every question is already answered finalizes instead of prompting", async () => {
    mGetSession.mockResolvedValue(
      makeSession({ state: "awaiting_consent", stage: "post_shortlist" }) as never,
    );
    mGetQuestions.mockResolvedValue([
      q("q1", "Office at HSR?"),
      q("q2", "Recruiter call?"),
    ] as never);
    mGetResponses.mockResolvedValue([
      { question_id: "q1", passed: true },
      { question_id: "q2", passed: true },
    ]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mPostShortlistComplete).toHaveBeenCalledTimes(1);
    expect(mDispatch).not.toHaveBeenCalled(); // no question re-asked
    expect(mRecord).not.toHaveBeenCalled();
  });

  it("consent NO closes the session with declined_at set (explicit opt-out, not timeout)", async () => {
    mGetSession.mockResolvedValue(makeSession({ state: "awaiting_consent" }) as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);
    mGetResponses.mockResolvedValue([]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "no",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mRecord).not.toHaveBeenCalled();
    // declined_at disambiguates the explicit NO from a lifecycle timeout so
    // the re-nudge path never re-invites a decliner.
    expect(mUpdate).toHaveBeenCalledWith(
      expect.anything(),
      "sess-1",
      expect.objectContaining({
        state: "complete",
        completed_at: expect.any(String),
        declined_at: expect.any(String),
      }),
    );
    expect(mDispatch).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("No problem"),
    );
  });

  it("consent YES with a recorded knockout NO resolves FAILED instead of prompting", async () => {
    mGetSession.mockResolvedValue(makeSession({ state: "awaiting_consent" }) as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?"), q("q2", "Work onsite?")] as never);
    mGetResponses.mockResolvedValue([{ question_id: "q1", passed: false }]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mFailed).toHaveBeenCalledTimes(1);
    expect(mDispatch).not.toHaveBeenCalled();
    expect(mRecord).not.toHaveBeenCalled();
  });
});

describe("handlePrescreenWhatsappReply — idempotency (first-answer-wins, no flip-flop)", () => {
  it("a later NO on an already-answered single-question gate does NOT flip it to failed", async () => {
    // Single question, already answered YES; session still open. A late 'no' arrives.
    mGetSession.mockResolvedValue(makeSession() as never);
    mGetQuestions.mockResolvedValue([q("q1", "Have 5y exp?")] as never);
    // existing already has q1 = passed; targetIndex === -1 -> resolve, never re-record.
    mGetResponses.mockResolvedValue([{ question_id: "q1", passed: true }]);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "no",
      candidateId: "cand-1",
    });
    expect(r).toBe(true);
    expect(mRecord).not.toHaveBeenCalled(); // first answer is never overwritten
    expect(mPassed).toHaveBeenCalledTimes(1); // resolves to the original PASS
    expect(mFailed).not.toHaveBeenCalled();
  });

  it("ignores a rapid duplicate reply within the guard window (no auto-fill of next Q)", async () => {
    process.env.PRESCREEN_DUPLICATE_REPLY_GUARD_MS = "60000";
    mGetSession.mockResolvedValue(
      makeSession({ updated_at: new Date().toISOString() }) as never, // just updated -> within window
    );
    mGetQuestions.mockResolvedValue([q("q1", "a"), q("q2", "b")] as never);

    const r = await handlePrescreenWhatsappReply({
      phone: "91",
      body: "yes",
      candidateId: "cand-1",
    });
    expect(r).toBe(true); // consumed (owned by gate) but...
    expect(mRecord).not.toHaveBeenCalled(); // ...not recorded
    expect(mPassed).not.toHaveBeenCalled();
    expect(mFailed).not.toHaveBeenCalled();
  });
});
