import { beforeEach, describe, expect, it, vi } from "vitest";

const mockProcessIdibuWebhook = vi.fn().mockResolvedValue({ outcome: "success" });
const mockAfter = vi.fn((fn: () => void | Promise<void>) => {
  void fn();
});

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (...args: unknown[]) => mockAfter(...args) };
});

vi.mock("@/lib/integrations/idibu/process-webhook", () => ({
  parseIdibuWebhookBody: (body: unknown) => body,
  processIdibuWebhook: (...args: unknown[]) => mockProcessIdibuWebhook(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// The platform endpoint resolves the vacancy's org before accepting the shared secret
// (platformPathAllowedForVacancy). Stub the admin client so the job lookup returns
// not-found → platform path allowed, with no real Supabase connection in the test env.
vi.mock("@/lib/supabase/admin", () => {
  const chain = {
    from: () => chain,
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
  };
  return { createSupabaseAdmin: () => chain };
});

function buildPayload(overrides: Record<string, unknown> = {}) {
  return {
    payload: {
      id: "idibu-cand-1",
      firstname: "Ada",
      lastname: "Lovelace",
      email: "ada@example.com",
      source: "Indeed",
      vacancies: [{ reference: "00000000-0000-4000-8000-000000000001", title: "Engineer" }],
      attachments: [{ type: "cv_doc", file_link: "https://example.com/cv.pdf" }],
      ...((overrides.payload as Record<string, unknown>) ?? {}),
    },
    "payload-information": { webhook_event: "candidate.create" },
    ...overrides,
  };
}

function setPlatformIdibuEnv() {
  process.env.IDIBU_APP_ID = "app-1";
  process.env.IDIBU_APP_SECRET = "secret-1";
  process.env.IDIBU_INTEGRATION_NAME = "tigerhire";
  process.env.IDIBU_WEBHOOK_SECRET = "expected-secret";
}

describe("POST /api/webhooks/idibu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.IDIBU_WEBHOOK_SECRET;
    delete process.env.IDIBU_APP_ID;
    delete process.env.IDIBU_APP_SECRET;
    delete process.env.IDIBU_INTEGRATION_NAME;
  });

  it("returns 501 when webhook secret is missing", async () => {
    const { POST } = await import("@/app/api/webhooks/idibu/route");
    const req = new Request("http://localhost/api/webhooks/idibu", {
      method: "POST",
      body: JSON.stringify(buildPayload()),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(501);
  });

  it("returns 401 when webhook secret does not match", async () => {
    setPlatformIdibuEnv();
    const { POST } = await import("@/app/api/webhooks/idibu/route");
    const req = new Request("http://localhost/api/webhooks/idibu", {
      method: "POST",
      headers: { "x-webhook-secret": "wrong-secret" },
      body: JSON.stringify(buildPayload()),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    expect(mockProcessIdibuWebhook).not.toHaveBeenCalled();
  });

  it("returns 200 immediately and schedules async processing", async () => {
    setPlatformIdibuEnv();
    const payload = buildPayload();
    const { POST } = await import("@/app/api/webhooks/idibu/route");
    const req = new Request("http://localhost/api/webhooks/idibu", {
      method: "POST",
      headers: {
        "x-webhook-secret": "expected-secret",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    expect(mockAfter).toHaveBeenCalled();
    // Second arg is the authenticated org: the target job must belong to it,
    // otherwise org A could inject candidates into org B's pipeline.
    expect(mockProcessIdibuWebhook).toHaveBeenCalledTimes(1);
    expect(mockProcessIdibuWebhook.mock.calls[0][0]).toEqual(payload);
    // The authenticated org must be passed through — it is what stops org A
    // injecting candidates into org B's job via a forged vacancy reference.
    expect(mockProcessIdibuWebhook.mock.calls[0].length).toBe(2);
  });
});
