import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  recruiterCtx,
  candidateCtx,
  buildRequest,
  fakeUuid,
} from "../helpers";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  parseJsonBody: async (request: Request) => {
    try {
      const body = await request.json();
      return { body, errorResponse: null };
    } catch {
      return {
        body: null,
        errorResponse: Response.json({ error: "Invalid JSON body" }, { status: 400 }),
      };
    }
  },
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, message: string) =>
    Response.json({ error: message }, { status: 500 }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/services/notifications", () => ({
  createNotification: vi.fn(),
}));

vi.mock("@/lib/services/resend", () => ({
  sendEmail: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  env: { baseUrl: "https://tigerhire.io" },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(new Request("http://localhost/api/messages") as never);
    expect(res.status).toBe(401);
  });

  it("returns empty list when user has no conversations", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const participantsBuilder = createMockQueryBuilder({
      data: [],
      error: null,
    });
    const supabase = createMockSupabase({
      conversation_participants: participantsBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(new Request("http://localhost/api/messages") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations).toEqual([]);
    expect(json.pagination).toMatchObject({ limit: 20, offset: 0, total: 0, hasMore: false });
  });

  it("GET returns conversations with unread counts", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const convId = fakeUuid("conv1");
    const participations = [
      {
        conversation_id: convId,
        last_read_at: "2026-02-20T10:00:00Z",
      },
    ];
    const conversations = [
      {
        id: convId,
        job_id: null,
        organisation_id: "org-1",
        subject: "Test",
        created_at: "2026-02-20T09:00:00Z",
        updated_at: "2026-02-23T10:00:00Z",
      },
    ];
    const lastMessage = {
      id: fakeUuid("msg1"),
      sender_id: candidateCtx.userId,
      body: "Hello",
      created_at: "2026-02-23T10:00:00Z",
    };

    const participantsBuilder = createMockQueryBuilder({
      data: participations,
    });
    const conversationsBuilder = createMockQueryBuilder({
      data: conversations,
    });
    const messagesBuilder = createMockQueryBuilder({
      data: lastMessage,
    });
    const convParticipantsBuilder = createMockQueryBuilder({
      data: [{ user_id: recruiterCtx.userId }, { user_id: candidateCtx.userId }],
    });

    let tableCallCount = 0;
    const supabase = createMockSupabase({
      conversation_participants: participantsBuilder,
      conversations: conversationsBuilder,
      messages: messagesBuilder,
    });

    // Mock the multiple from() calls for messages and participants
    supabase.from = vi.fn((table: string) => {
      if (table === "conversation_participants") {
        if (tableCallCount === 0) {
          tableCallCount++;
          return participantsBuilder;
        }
        return convParticipantsBuilder;
      }
      if (table === "conversations") {
        return conversationsBuilder;
      }
      if (table === "messages") {
        if (tableCallCount === 1) {
          tableCallCount++;
          return messagesBuilder;
        }
        // Return unread count builder
        const countBuilder = createMockQueryBuilder({ count: 3 });
        return countBuilder;
      }
      return createMockQueryBuilder();
    });

    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(new Request("http://localhost/api/messages") as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversations).toBeDefined();
    expect(Array.isArray(json.conversations)).toBe(true);
  });
});

describe("POST /api/messages", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/messages/route");
    const req = buildRequest("http://localhost/api/messages", {
      method: "POST",
      body: { participant_ids: ["u1"], message: "hello" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 422 when participant_ids is missing", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/route");
    const req = buildRequest("http://localhost/api/messages", {
      method: "POST",
      body: { message: "hello" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns 422 when message is empty", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/route");
    const req = buildRequest("http://localhost/api/messages", {
      method: "POST",
      body: { participant_ids: ["u1"], message: "" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("creates conversation and sends initial message", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const convId = fakeUuid("conv1");
    const msgId = fakeUuid("msg1");

    const convBuilder = createMockQueryBuilder({
      data: { id: convId, subject: null, job_id: null },
    });
    const participantsBuilder = createMockQueryBuilder({ data: null });
    const messagesBuilder = createMockQueryBuilder({
      data: { id: msgId, body: "hello", sender_id: recruiterCtx.userId },
    });
    const profilesBuilder = createMockQueryBuilder({
      data: [{ id: candidateCtx.userId, organisation_id: null }],
    });

    const supabase = createMockSupabase({
      conversations: convBuilder,
      conversation_participants: participantsBuilder,
      messages: messagesBuilder,
      profiles: profilesBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/route");
    const req = buildRequest("http://localhost/api/messages", {
      method: "POST",
      body: { participant_ids: [candidateCtx.userId], message: "hello" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);
    const { POST } = await import("@/app/api/messages/route");
    const req = new Request("http://localhost/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it("POST creates a new conversation", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const convId = fakeUuid("conv1");
    const msgId = fakeUuid("msg1");

    const convBuilder = createMockQueryBuilder({
      data: {
        id: convId,
        subject: "New Conversation",
        job_id: null,
        organisation_id: recruiterCtx.organisationId,
      },
    });
    const participantsBuilder = createMockQueryBuilder({ data: null });
    const messagesBuilder = createMockQueryBuilder({
      data: {
        id: msgId,
        body: "Initial message",
        sender_id: recruiterCtx.userId,
      },
    });
    const profilesBuilder = createMockQueryBuilder({
      data: [{ id: candidateCtx.userId, organisation_id: null }],
    });

    const supabase = createMockSupabase({
      conversations: convBuilder,
      conversation_participants: participantsBuilder,
      messages: messagesBuilder,
      profiles: profilesBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/route");
    const req = buildRequest("http://localhost/api/messages", {
      method: "POST",
      body: {
        participant_ids: [candidateCtx.userId],
        subject: "New Conversation",
        message: "Initial message",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.conversation).toBeDefined();
    expect(json.message).toBeDefined();
  });

  it("Messages require authentication", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/messages/route");
    const res = await GET(new Request("http://localhost/api/messages") as never);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/messages/[conversationId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const res = await GET(new Request("http://localhost/api/messages/conv1") as never, {
      params: Promise.resolve({ conversationId: "conv1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when user is not a participant", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const participantsBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      conversation_participants: participantsBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const res = await GET(new Request("http://localhost/api/messages/conv1") as never, {
      params: Promise.resolve({ conversationId: "conv1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 200 with participant and message list", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const conversationId = fakeUuid("conv-success");
    const messages = [
      {
        id: fakeUuid("msg-1"),
        conversation_id: conversationId,
        sender_id: recruiterCtx.userId,
        body: "First message",
        attachment_url: null,
        attachment_name: null,
        created_at: "2026-03-01T10:00:00Z",
        edited_at: null,
      },
      {
        id: fakeUuid("msg-2"),
        conversation_id: conversationId,
        sender_id: candidateCtx.userId,
        body: "Second message",
        attachment_url: null,
        attachment_name: null,
        created_at: "2026-03-01T10:05:00Z",
        edited_at: null,
      },
    ];
    const conversationParticipantsBuilder = createMockQueryBuilder({
      data: { id: "participant-row" },
    });
    const markReadBuilder = createMockQueryBuilder({ data: null });
    const participantsListBuilder = createMockQueryBuilder({
      data: [
        { user_id: recruiterCtx.userId, last_read_at: "2026-03-01T10:10:00Z" },
        { user_id: candidateCtx.userId, last_read_at: null },
      ],
    });
    const messagesBuilder = createMockQueryBuilder({ data: messages });
    const conversationBuilder = createMockQueryBuilder({
      data: {
        id: conversationId,
        subject: "Interview updates",
        job_id: fakeUuid("job-1"),
        created_at: "2026-03-01T09:00:00Z",
        updated_at: "2026-03-01T10:10:00Z",
      },
    });

    let participantsCallCount = 0;
    const supabase = createMockSupabase();
    supabase.from = vi.fn((table: string) => {
      if (table === "conversation_participants") {
        participantsCallCount += 1;
        if (participantsCallCount === 1) return conversationParticipantsBuilder;
        if (participantsCallCount === 2) return markReadBuilder;
        return participantsListBuilder;
      }
      if (table === "messages") return messagesBuilder;
      if (table === "conversations") return conversationBuilder;
      return createMockQueryBuilder();
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/messages/[conversationId]/route");
    const res = await GET(
      new Request(`http://localhost/api/messages/${conversationId}?limit=10`) as never,
      {
        params: Promise.resolve({ conversationId }),
      },
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.conversation?.id).toBe(conversationId);
    expect(json.participants).toHaveLength(2);
    expect(json.messages).toHaveLength(2);
  });
});

describe("POST /api/messages/[conversationId]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/messages/[conversationId]/route");
    const req = buildRequest("http://localhost/api/messages/conv1", {
      method: "POST",
      body: { body: "hello" },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ conversationId: "conv1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 422 when message body is empty", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const participantsBuilder = createMockQueryBuilder({
      data: { id: "p1" },
    });
    const supabase = createMockSupabase({
      conversation_participants: participantsBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/[conversationId]/route");
    const req = buildRequest("http://localhost/api/messages/conv1", {
      method: "POST",
      body: { body: "" },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ conversationId: "conv1" }),
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 when not a participant", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const participantsBuilder = createMockQueryBuilder({ data: null });
    const supabase = createMockSupabase({
      conversation_participants: participantsBuilder,
    });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/[conversationId]/route");
    const req = buildRequest("http://localhost/api/messages/conv1", {
      method: "POST",
      body: { body: "hello" },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ conversationId: "conv1" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST to conversation sends a message", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const convId = fakeUuid("conv1");
    const msgId = fakeUuid("msg2");

    const participantCheckBuilder = createMockQueryBuilder({
      data: { id: "p1", conversation_id: convId, user_id: recruiterCtx.userId },
    });
    const participantsListBuilder = createMockQueryBuilder({
      data: [],
    });
    const messagesBuilder = createMockQueryBuilder({
      data: { id: msgId, body: "New message", sender_id: recruiterCtx.userId },
    });
    const conversationsBuilder = createMockQueryBuilder({ data: null });
    const profilesBuilder = createMockQueryBuilder({
      data: { full_name: "Recruiter Name" },
    });
    let conversationParticipantsCallCount = 0;
    const fromMock = vi.fn((table: string) => {
      if (table === "conversation_participants") {
        conversationParticipantsCallCount++;
        return conversationParticipantsCallCount === 1
          ? participantCheckBuilder
          : participantsListBuilder;
      }
      if (table === "messages") return messagesBuilder;
      if (table === "conversations") return conversationsBuilder;
      if (table === "profiles") return profilesBuilder;
      return createMockQueryBuilder();
    });
    const supabase = createMockSupabase({
      messages: messagesBuilder,
      conversations: conversationsBuilder,
    });
    supabase.from = fromMock;
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/messages/[conversationId]/route");
    const req = buildRequest(`http://localhost/api/messages/${convId}`, {
      method: "POST",
      body: { body: "New message" },
    });
    const res = await POST(req as never, {
      params: Promise.resolve({ conversationId: convId }),
    });
    expect(res.status).toBe(201);
  });
});
