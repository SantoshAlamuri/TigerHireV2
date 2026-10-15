import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }),
      };
    }
  },
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown) =>
    new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: (...args: unknown[]) => mockFrom(...args),
    }),
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/resend", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/config/env", () => ({ env: { baseUrl: "https://app.test.com" } }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

function chainMaybeSingle(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    update: vi.fn().mockReturnThis(),
  };
}

describe("GET /api/messages/[conversationId]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const req = new NextRequest("http://localhost:3000/api/messages/conv-1");
    const res = await GET(req, { params: Promise.resolve({ conversationId: "conv-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not participant", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockReturnValue(chainMaybeSingle(null));
    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const req = new NextRequest("http://localhost:3000/api/messages/conv-1");
    const res = await GET(req, { params: Promise.resolve({ conversationId: "conv-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with messages when user is participant", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const participantCheckChain = chainMaybeSingle({ id: "p1" });
    const participantUpdateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
    };
    const participantListChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [{ user_id: recruiterCtx.userId, last_read_at: null }],
        error: null,
      }),
    };
    const messagesChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
      lt: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    const conversationsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: {
          id: "conv-1",
          subject: "Test",
          job_id: null,
          created_at: "2026-01-01",
          updated_at: "2026-01-02",
        },
        error: null,
      }),
    };
    let participantCall = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "conversation_participants") {
        participantCall += 1;
        if (participantCall === 1) return participantCheckChain;
        if (participantCall === 2) return participantUpdateChain;
        return participantListChain;
      }
      if (table === "conversations") return conversationsChain;
      if (table === "messages") return messagesChain;
      return chainMaybeSingle(null);
    });
    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const req = new NextRequest("http://localhost:3000/api/messages/conv-1");
    const res = await GET(req, { params: Promise.resolve({ conversationId: "conv-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.messages).toBeDefined();
    expect(Array.isArray(body.messages)).toBe(true);
  });
});
