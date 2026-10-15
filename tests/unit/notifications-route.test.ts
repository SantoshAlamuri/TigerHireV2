import { describe, it, expect, vi, beforeEach } from "vitest";
import { recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: () => mockGetAuthContext(),
    requireAuth: (ctx: unknown) => ctx !== null,
    jsonError: (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    jsonSuccess: (data: unknown, status = 200) =>
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
  };
});

const mockList = vi.fn().mockResolvedValue([{ id: "n1", title: "Test" }]);
const mockUnreadCount = vi.fn().mockResolvedValue(3);
const mockMarkRead = vi.fn();
const mockMarkAllRead = vi.fn();

vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: {
    list: (...args: unknown[]) => mockList(...args),
    unreadCount: (...args: unknown[]) => mockUnreadCount(...args),
    markRead: (...args: unknown[]) => mockMarkRead(...args),
    markAllRead: (...args: unknown[]) => mockMarkAllRead(...args),
  },
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({}),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/notifications", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications");
    const res = await GET(req as any);
    expect(res.status).toBe(401);
  });

  it("returns notifications with unread count", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications?limit=20&offset=0");
    const res = await GET(req as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notifications).toBeDefined();
    expect(body.unreadCount).toBe(3);
  });
});

describe("PATCH /api/notifications", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockMarkRead.mockClear();
    mockMarkAllRead.mockClear();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(401);
  });

  it("marks all as read when markAllRead is true", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAllRead: true }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    expect(mockMarkAllRead).toHaveBeenCalled();
  });

  it("marks specific IDs as read", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: ["n1", "n2"] }),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(200);
    expect(mockMarkRead).toHaveBeenCalled();
  });

  it("returns 422 for invalid body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/notifications/route");
    const req = new Request("http://localhost:3000/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await PATCH(req as any);
    expect(res.status).toBe(422);
  });
});
