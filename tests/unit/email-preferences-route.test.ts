import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createMockSupabase,
  createMockQueryBuilder,
  candidateCtx,
  recruiterCtx,
  buildRequest,
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
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/email-preferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/email-preferences/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns existing preferences", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const prefs = {
      id: "pref-1",
      user_id: candidateCtx.userId,
      marketing: true,
      job_alerts: true,
      application_updates: true,
      messages: true,
      interview_reminders: true,
      weekly_digest: false,
    };
    const builder = createMockQueryBuilder({ data: prefs });
    const supabase = createMockSupabase({ email_preferences: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/email-preferences/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.preferences.weekly_digest).toBe(false);
  });

  it("creates default preferences if none exist", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const newPrefs = {
      id: "pref-new",
      user_id: candidateCtx.userId,
      marketing: true,
      job_alerts: true,
      application_updates: true,
      messages: true,
      interview_reminders: true,
      weekly_digest: true,
    };
    const builder = createMockQueryBuilder({ data: null });
    const insertBuilder = createMockQueryBuilder({ data: newPrefs });

    const fromMock = vi.fn((table: string) => {
      if (table === "email_preferences") {
        let callCount = 0;
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockImplementation(() => {
                callCount++;
                if (callCount === 1) return Promise.resolve({ data: null, error: null });
                return Promise.resolve({ data: newPrefs, error: null });
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: newPrefs, error: null }),
            }),
          }),
        };
      }
      return builder;
    });

    const supabase = { from: fromMock, auth: { getUser: vi.fn() } };
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/email-preferences/route");
    const res = await GET();
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/email-preferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/email-preferences/route");
    const req = buildRequest("http://localhost/api/email-preferences", {
      method: "PATCH",
      body: { marketing: false },
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 422 when no valid preferences provided", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/email-preferences/route");
    const req = buildRequest("http://localhost/api/email-preferences", {
      method: "PATCH",
      body: { nonexistent: "value" },
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(422);
  });

  it("updates preferences successfully", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const updatedPrefs = {
      id: "pref-1",
      user_id: candidateCtx.userId,
      marketing: false,
      job_alerts: true,
      application_updates: true,
      messages: false,
      interview_reminders: true,
      weekly_digest: true,
    };
    const builder = createMockQueryBuilder({ data: updatedPrefs });
    const existingBuilder = createMockQueryBuilder({ data: { id: "pref-1" } });

    const fromMock = vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: { id: "pref-1" }, error: null }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: updatedPrefs, error: null }),
          }),
        }),
      }),
    }));

    const supabase = { from: fromMock, auth: { getUser: vi.fn() } };
    mockCreateSupabase.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/email-preferences/route");
    const req = buildRequest("http://localhost/api/email-preferences", {
      method: "PATCH",
      body: { marketing: false, messages: false },
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(200);
  });

  it("rejects non-boolean preference values", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/email-preferences/route");
    const req = buildRequest("http://localhost/api/email-preferences", {
      method: "PATCH",
      body: { marketing: "yes" },
    });
    const res = await PATCH(req as never);
    expect(res.status).toBe(422);
  });
});
