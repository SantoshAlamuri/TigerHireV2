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
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreateSupabase = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/saved-searches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/saved-searches/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns empty list for user with no saved searches", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const builder = createMockQueryBuilder({ data: [] });
    const supabase = createMockSupabase({ saved_searches: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/saved-searches/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.searches).toEqual([]);
  });

  it("returns saved searches for authenticated user", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const builder = createMockQueryBuilder({
      data: [
        {
          id: fakeUuid("ss1"),
          name: "React Remote",
          filters: { remote: true },
        },
        {
          id: fakeUuid("ss2"),
          name: "SDE Bangalore",
          filters: { location: "Bangalore" },
        },
      ],
    });
    const supabase = createMockSupabase({ saved_searches: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/saved-searches/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.searches).toHaveLength(2);
  });
});

describe("POST /api/saved-searches", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/saved-searches/route");
    const req = buildRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: { name: "test", filters: {} },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it("returns 422 when name is missing", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/saved-searches/route");
    const req = buildRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: { filters: {} },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns 422 when filters is missing", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/saved-searches/route");
    const req = buildRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: { name: "test" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid alert_frequency", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/saved-searches/route");
    const req = buildRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: { name: "test", filters: {}, alert_frequency: "hourly" },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(422);
  });

  it("creates saved search successfully", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const searchData = {
      id: fakeUuid("ss1"),
      user_id: candidateCtx.userId,
      name: "SDE Remote",
      filters: { remote: true, role_function: "Engineering" },
      alert_enabled: true,
      alert_frequency: "daily",
    };
    const builder = createMockQueryBuilder({ data: searchData });
    const supabase = createMockSupabase({ saved_searches: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { POST } = await import("@/app/api/saved-searches/route");
    const req = buildRequest("http://localhost/api/saved-searches", {
      method: "POST",
      body: {
        name: "SDE Remote",
        filters: { remote: true, role_function: "Engineering" },
        alert_enabled: true,
        alert_frequency: "daily",
      },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.search.name).toBe("SDE Remote");
  });
});

describe("DELETE /api/saved-searches/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/saved-searches/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/saved-searches/id1") as never, {
      params: Promise.resolve({ id: fakeUuid("ss1") }),
    });
    expect(res.status).toBe(401);
  });

  it("deletes saved search successfully", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const builder = createMockQueryBuilder({ data: null, error: null });
    const supabase = createMockSupabase({ saved_searches: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { DELETE } = await import("@/app/api/saved-searches/[id]/route");
    const res = await DELETE(new Request("http://localhost/api/saved-searches/id1") as never, {
      params: Promise.resolve({ id: fakeUuid("ss1") }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deleted).toBe(true);
  });
});

describe("PATCH /api/saved-searches/[id]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authenticated", async () => {
    mockGetAuth.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/saved-searches/[id]/route");
    const req = buildRequest("http://localhost/api/saved-searches/id1", {
      method: "PATCH",
      body: { alert_enabled: true },
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: fakeUuid("ss1") }),
    });
    expect(res.status).toBe(401);
  });

  it("rejects invalid alert_frequency", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = createMockSupabase();
    mockCreateSupabase.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/saved-searches/[id]/route");
    const req = buildRequest("http://localhost/api/saved-searches/id1", {
      method: "PATCH",
      body: { alert_frequency: "monthly" },
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: fakeUuid("ss1") }),
    });
    expect(res.status).toBe(422);
  });

  it("updates saved search successfully", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const updated = {
      id: fakeUuid("ss1"),
      name: "Updated Search",
      alert_enabled: true,
      alert_frequency: "daily",
    };
    const builder = createMockQueryBuilder({ data: updated });
    const supabase = createMockSupabase({ saved_searches: builder });
    mockCreateSupabase.mockResolvedValue(supabase);

    const { PATCH } = await import("@/app/api/saved-searches/[id]/route");
    const req = buildRequest("http://localhost/api/saved-searches/id1", {
      method: "PATCH",
      body: {
        name: "Updated Search",
        alert_enabled: true,
        alert_frequency: "daily",
      },
    });
    const res = await PATCH(req as never, {
      params: Promise.resolve({ id: fakeUuid("ss1") }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.search.name).toBe("Updated Search");
  });
});
