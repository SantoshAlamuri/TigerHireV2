import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/lib/feature-flags", () => ({
  isEnabled: vi.fn(),
}));

vi.mock("@/lib/integrations/notetaker/recall", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/notetaker/recall")>();
  return {
    ...actual,
    dispatchRecallBot: vi.fn(),
  };
});

import { isEnabled } from "@/lib/feature-flags";
import {
  verifyRecallWebhookSignature,
  dispatchRecallBot,
  normalizeRecallStatus,
} from "@/lib/integrations/notetaker/recall";
import { maybeDispatchNotetakerBot } from "@/lib/interviews/notetaker-dispatch";
import { interviewSummarySchema } from "@/lib/interviews/extract-interview-summary";

describe("verifyRecallWebhookSignature (Svix scheme)", () => {
  const secretRaw = Buffer.from("super-secret-recall-signing-key").toString("base64");

  beforeEach(() => {
    process.env.RECALL_WEBHOOK_SECRET = `whsec_${secretRaw}`;
  });

  function sign(id: string, timestamp: string, body: string): string {
    const signed = `${id}.${timestamp}.${body}`;
    const sig = createHmac("sha256", Buffer.from(secretRaw, "base64"))
      .update(signed, "utf8")
      .digest("base64");
    return `v1,${sig}`;
  }

  it("accepts a correctly signed payload", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000));
    const body = JSON.stringify({ event: "bot.done", data: { bot: { id: "bot_1" } } });
    expect(
      verifyRecallWebhookSignature(body, { id, timestamp: ts, signature: sign(id, ts, body) }),
    ).toBe(true);
  });

  it("rejects a stale (replayed) timestamp even when correctly signed", () => {
    const id = "msg_abc";
    const ts = String(Math.floor(Date.now() / 1000) - 3600); // 1 hour old
    const body = JSON.stringify({ event: "bot.done", data: { bot: { id: "bot_1" } } });
    expect(
      verifyRecallWebhookSignature(body, { id, timestamp: ts, signature: sign(id, ts, body) }),
    ).toBe(false);
  });

  it("rejects a tampered body", () => {
    const id = "msg_abc";
    const ts = "1718000000";
    const body = JSON.stringify({ event: "bot.done" });
    const signature = sign(id, ts, body);
    expect(verifyRecallWebhookSignature(body + "tampered", { id, timestamp: ts, signature })).toBe(
      false,
    );
  });

  it("rejects when headers are missing", () => {
    expect(verifyRecallWebhookSignature("{}", { id: null, timestamp: null, signature: null })).toBe(
      false,
    );
  });
});

describe("maybeDispatchNotetakerBot gating", () => {
  beforeEach(() => {
    vi.mocked(isEnabled).mockReset();
    vi.mocked(dispatchRecallBot).mockReset();
  });

  it("skips with no_organisation when org is missing", async () => {
    const result = await maybeDispatchNotetakerBot({
      admin: {} as never,
      slotId: "slot-1",
      organisationId: null,
      slotStartAt: "2026-07-01T10:00:00.000Z",
    });
    expect(result).toEqual({ status: "skipped", reason: "no_organisation" });
    expect(dispatchRecallBot).not.toHaveBeenCalled();
  });

  it("skips and never dispatches a bot when the flag is off", async () => {
    vi.mocked(isEnabled).mockResolvedValue(false);
    const admin = {
      from: vi.fn(() => {
        throw new Error("admin client should not be touched when flag is off");
      }),
    };
    const result = await maybeDispatchNotetakerBot({
      admin: admin as never,
      slotId: "slot-1",
      organisationId: "org-1",
      slotStartAt: "2026-07-01T10:00:00.000Z",
    });
    expect(result).toEqual({ status: "skipped", reason: "flag_off" });
    expect(dispatchRecallBot).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
  });
});

describe("normalizeRecallStatus", () => {
  it("maps the prefixed event name and bare code to done", () => {
    expect(normalizeRecallStatus("bot.done")).toBe("done");
    expect(normalizeRecallStatus("done")).toBe("done");
    expect(normalizeRecallStatus("analysis_done")).toBe("done");
  });

  it("maps fatal to failed", () => {
    expect(normalizeRecallStatus("bot.fatal")).toBe("failed");
    expect(normalizeRecallStatus("fatal")).toBe("failed");
  });

  it("keeps call_ended and in-progress states non-terminal (waits for bot.done)", () => {
    expect(normalizeRecallStatus("bot.call_ended")).toBe("pending");
    expect(normalizeRecallStatus("bot.in_call_recording")).toBe("pending");
    expect(normalizeRecallStatus("bot.joining_call")).toBe("pending");
  });
});

describe("Recall API contract", () => {
  beforeEach(() => {
    process.env.RECALL_API_KEY = "recall-test-key";
    delete process.env.RECALL_BASE_URL;
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.RECALL_API_KEY;
  });

  it("creates bots via POST /api/v1/bot/ (trailing slash) with meeting_captions transcript", async () => {
    const actual = await vi.importActual<typeof import("@/lib/integrations/notetaker/recall")>(
      "@/lib/integrations/notetaker/recall",
    );
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "bot-1" }) });

    const result = await actual.dispatchRecallBot({
      meetingUrl: "https://meet.google.com/abc-defg-hij",
      metadata: { recording_id: "rec-1" },
    });

    expect(result.recall_bot_id).toBe("bot-1");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://us-west-2.recall.ai/api/v1/bot/");
    const body = JSON.parse(String(init.body));
    expect(body.meeting_url).toBe("https://meet.google.com/abc-defg-hij");
    expect(body.recording_config.transcript.provider).toEqual({ meeting_captions: {} });
    expect(body.metadata).toEqual({ recording_id: "rec-1" });
  });

  it("fetches artifacts via Retrieve Bot + transcript download_url (participant schema)", async () => {
    const actual = await vi.importActual<typeof import("@/lib/integrations/notetaker/recall")>(
      "@/lib/integrations/notetaker/recall",
    );
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const botPayload = {
      id: "bot-1",
      status_changes: [{ code: "joining_call" }, { code: "done" }],
      recordings: [
        {
          id: "rec-uuid",
          started_at: "2026-07-09T10:00:00.000Z",
          completed_at: "2026-07-09T10:30:00.000Z",
          media_shortcuts: {
            video_mixed: { data: { download_url: "https://dl.recall.ai/video?token=t" } },
            transcript: { data: { download_url: "https://dl.recall.ai/transcript?token=t" } },
          },
        },
      ],
    };
    const transcriptPayload = [
      {
        participant: { id: 100, name: "Interviewer" },
        words: [{ text: "Tell me about yourself." }],
      },
      {
        participant: { id: 200, name: "Candidate" },
        words: [{ text: "I led the migration" }, { text: "end to end." }],
      },
    ];
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: async () => botPayload })
      .mockResolvedValueOnce({ ok: true, json: async () => transcriptPayload });

    const artifacts = await actual.fetchRecallBotArtifacts("bot-1");

    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://us-west-2.recall.ai/api/v1/bot/bot-1/");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://dl.recall.ai/transcript?token=t");
    expect(artifacts.status).toBe("done");
    expect(artifacts.recording_url).toBe("https://dl.recall.ai/video?token=t");
    expect(artifacts.duration_seconds).toBe(1800);
    expect(artifacts.transcript).toBe(
      "Interviewer: Tell me about yourself.\nCandidate: I led the migration end to end.",
    );
  });
});

describe("interviewSummarySchema", () => {
  it("parses a well-formed scorecard", () => {
    const fixture = {
      overall_recommendation: "advance",
      summary: "Strong candidate with relevant experience.",
      strengths: ["Clear communicator"],
      concerns: ["Limited exposure to scale"],
      competency_signals: { communication: "strong", technical: "moderate", role_fit: "strong" },
      notable_quotes: ["I led the migration end to end."],
      follow_up_questions: ["Probe distributed-systems depth"],
    };
    expect(() => interviewSummarySchema.parse(fixture)).not.toThrow();
  });

  it("rejects an invalid recommendation value", () => {
    const bad = {
      overall_recommendation: "maybe",
      summary: "",
      strengths: [],
      concerns: [],
      competency_signals: { communication: "strong", technical: "weak", role_fit: "weak" },
      notable_quotes: [],
      follow_up_questions: [],
    };
    expect(() => interviewSummarySchema.parse(bad)).toThrow();
  });
});
