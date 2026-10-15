import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The Bolna voice integration is gated behind the voice_screening_bolna feature flag (default
// off). initiateBolnaCall is the last-line hard guard: it must never place an outbound HTTP
// call when the flag is off, regardless of how the screening job reached this point.
const mockIsEnabled = vi.hoisted(() => vi.fn());
vi.mock("@/lib/feature-flags", () => ({
  isEnabled: (...args: unknown[]) => mockIsEnabled(...args),
}));

import { initiateBolnaCall, type InitiateBolnaCallParams } from "@/lib/screening/voice/bolna";
import { FEATURE_FLAG_VOICE_SCREENING_BOLNA } from "@/lib/screening/voice/constants";

const baseParams: InitiateBolnaCallParams = {
  organisation_id: "org-123",
  candidate_phone: "+919876543210",
  candidate_name: "Ada",
  company_name: "Acme",
  role_title: "Engineer",
  req_location: "Remote",
  script: { system_prompt: "Hi {candidate_name}", version: "1.0.0" },
  webhook_correlation_id: "job-1",
};

describe("initiateBolnaCall feature-flag guard", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    process.env.BOLNA_API_KEY = "test-key";
    process.env.BOLNA_AGENT_ID = "agent-1";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    delete process.env.BOLNA_API_KEY;
    delete process.env.BOLNA_AGENT_ID;
  });

  it("throws and never calls fetch when the flag is off", async () => {
    mockIsEnabled.mockResolvedValue(false);
    await expect(initiateBolnaCall(baseParams)).rejects.toThrow("voice_screening_bolna_disabled");
    expect(mockIsEnabled).toHaveBeenCalledWith(FEATURE_FLAG_VOICE_SCREENING_BOLNA, "org-123");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("places the call when the flag is on", async () => {
    mockIsEnabled.mockResolvedValue(true);
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ execution_id: "exec-999" }),
    });
    const result = await initiateBolnaCall(baseParams);
    expect(result.bolna_call_id).toBe("exec-999");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("never places a production call without a provisioned from-number", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BOLNA_FROM_PHONE_NUMBER", "");
    mockIsEnabled.mockResolvedValue(true);
    await expect(initiateBolnaCall(baseParams)).rejects.toThrow(
      "BOLNA_FROM_PHONE_NUMBER is required in production",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends only documented /call fields, with variables carried via user_data", async () => {
    mockIsEnabled.mockResolvedValue(true);
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ execution_id: "exec-1" }),
    });

    await initiateBolnaCall(baseParams);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.bolna.ai/call");
    const body = JSON.parse(String(init.body));
    expect(Object.keys(body).sort()).toEqual(["agent_id", "recipient_phone_number", "user_data"]);
    expect(body.agent_id).toBe("agent-1");
    expect(body.recipient_phone_number).toBe("+919876543210");
    expect(body.user_data.webhook_correlation_id).toBe("job-1");
    // Prompt template variables are rendered before being handed to the agent.
    expect(body.user_data.screening_system_prompt).toBe("Hi Ada");
  });
});

describe("fetchBolnaCallArtifacts execution parsing", () => {
  beforeEach(() => {
    process.env.BOLNA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.BOLNA_API_KEY;
  });

  it("reads documented execution fields (transcript, telephony_data, conversation_duration)", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "exec-1",
        status: "completed",
        transcript: "assistant: Hello\nuser: Hi",
        conversation_duration: 92.4,
        telephony_data: {
          duration: "95",
          recording_url: "https://recordings.example.com/exec-1.mp3",
          hangup_by: "callee",
        },
      }),
    });

    const { fetchBolnaCallArtifacts } = await import("@/lib/screening/voice/bolna");
    const artifacts = await fetchBolnaCallArtifacts("exec-1");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.bolna.ai/executions/exec-1",
      expect.objectContaining({ method: "GET" }),
    );
    expect(artifacts.status).toBe("completed");
    expect(artifacts.transcript).toContain("Hello");
    expect(artifacts.audio_url).toBe("https://recordings.example.com/exec-1.mp3");
    expect(artifacts.duration_seconds).toBe(92);
  });

  it("maps busy and no-answer to no_answer", async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const { fetchBolnaCallArtifacts } = await import("@/lib/screening/voice/bolna");
    for (const status of ["busy", "no-answer"]) {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "e", status }) });
      const artifacts = await fetchBolnaCallArtifacts("e");
      expect(artifacts.status).toBe("no_answer");
    }
  });
});
