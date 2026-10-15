import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const sendWhatsAppMessage = vi.fn();
const insertApplicationWaMessage = vi.fn();
const getById = vi.fn();
const assertAccess = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(async () => ({
    userId: "user-1",
    role: "recruiter",
    organisationId: "org-1",
  })),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (_ctx: unknown, ...roles: string[]) => roles.includes("recruiter"),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (data: unknown) => new Response(JSON.stringify({ data }), { status: 200 }),
  handleApiError: (_e: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { name: "Aarav Nair", full_name: "Aarav Nair", phone: "+91 98100 1200" },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/repositories/ApplicationRepository", () => ({
  ApplicationRepository: { getById: (...a: unknown[]) => getById(...a) },
}));
vi.mock("@/lib/applications/assert-application-access", () => ({
  assertApplicationRouteAccess: (...a: unknown[]) => assertAccess(...a),
}));
vi.mock("@/lib/services/whatsapp", () => ({
  sendWhatsAppMessage: (...a: unknown[]) => sendWhatsAppMessage(...a),
}));
vi.mock("@/lib/whatsapp/wa-messages-db", () => ({
  insertApplicationWaMessage: (...a: unknown[]) => insertApplicationWaMessage(...a),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { POST } from "@/app/api/applications/[id]/whatsapp-query/route";

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/applications/app-1/whatsapp-query", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

const ctx = { params: Promise.resolve({ id: "app-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  getById.mockResolvedValue({ candidate_id: "cand-1", jobs: null, candidates: null });
  assertAccess.mockResolvedValue(null);
  sendWhatsAppMessage.mockResolvedValue({ success: true, messageId: "wamid.1" });
});

describe("POST /api/applications/[id]/whatsapp-query", () => {
  it("REJECTS free text — only system-framed presets may reach a candidate", async () => {
    const res = await POST(makeRequest({ message: "Scope inflation risk: verify team size" }), ctx);
    expect(res.status).toBe(400);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("sends a preset query and logs it to the timeline", async () => {
    const res = await POST(makeRequest({ preset: "ask_logistics" }), ctx);
    expect(res.status).toBe(200);
    expect(insertApplicationWaMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        applicationId: "app-1",
        direction: "out",
        status: "sent",
        templateName: "recruiter_query:ask_logistics",
      }),
    );
  });

  it("expands presets with the candidate's first name", async () => {
    const res = await POST(makeRequest({ preset: "request_cv" }), ctx);
    expect(res.status).toBe(200);
    const sent = sendWhatsAppMessage.mock.calls[0][1] as string;
    expect(sent).toContain("Aarav");
    expect(sent.toLowerCase()).toContain("cv");
  });

  it("rejects empty input", async () => {
    const res = await POST(makeRequest({}), ctx);
    expect(res.status).toBe(400);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("logs FAILED sends to the timeline and surfaces the error", async () => {
    sendWhatsAppMessage.mockResolvedValue({ success: false, error: "outside_session_window" });
    const res = await POST(makeRequest({ preset: "request_cv" }), ctx);
    expect(res.status).toBe(502);
    expect(insertApplicationWaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("404s when the application does not exist", async () => {
    getById.mockResolvedValue(null);
    const res = await POST(makeRequest({ preset: "request_cv" }), ctx);
    expect(res.status).toBe(404);
  });
});
