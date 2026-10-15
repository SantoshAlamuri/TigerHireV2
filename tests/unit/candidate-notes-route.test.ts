import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();
const mockValidateOrigin = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({
        error: err.issues.map((e: { message: string }) => e.message).join("; "),
      }),
      {
        status: 422,
        headers: { "Content-Type": "application/json" },
      },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildScopedRateLimitKey: () => "candidate-notes:test",
  RATE_LIMIT_PRESETS: {},
}));

const mockCreateNotificationBatch = vi.fn();
vi.mock("@/lib/services/notifications", () => ({
  createNotificationBatch: (...args: unknown[]) => mockCreateNotificationBatch(...args),
}));

const candidateLookupBuilder = createMockQueryBuilder({ data: { id: "123" }, error: null });
const notesQueryBuilder = createMockQueryBuilder({ data: [], error: null });
const notesInsertBuilder = createMockQueryBuilder({ data: null, error: null });
const profilesBuilder = createMockQueryBuilder({ data: [], error: null });
const defaultBuilder = createMockQueryBuilder({ data: null, error: null });
// Notes are org-scoped through job_id, so the route resolves the caller's
// accessible jobs before reading/writing (see candidate-notes-tenancy.test.ts).
const jobsBuilder = createMockQueryBuilder({
  data: [{ id: "00000000-0000-4000-8000-000000000001" }],
  error: null,
});
const mockSupabaseAdmin = {
  rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  from: vi.fn((table: string) => {
    if (table === "candidates") return candidateLookupBuilder;
    if (table === "candidate_notes") return notesQueryBuilder;
    if (table === "profiles") return profilesBuilder;
    if (table === "jobs") return jobsBuilder;
    return defaultBuilder;
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/candidates/[id]/notes", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    candidateLookupBuilder.maybeSingle.mockResolvedValue({ data: { id: "123" }, error: null });
    notesQueryBuilder.range.mockResolvedValue({ data: [], error: null });
    profilesBuilder.in.mockResolvedValue({ data: [], error: null });
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes");
    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes");
    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(403);
  });

  it("returns notes for recruiter", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    notesQueryBuilder.range.mockResolvedValue({
      data: [
        {
          id: 1,
          candidate_id: "123",
          body: "Strong candidate",
          created_at: "2024-01-01T00:00:00Z",
          author_id: recruiterCtx.userId,
        },
      ],
      error: null,
    });

    const { GET } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes");
    const res = await GET(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBeDefined();
    expect(Array.isArray(body.notes)).toBe(true);
  });
});

describe("POST /api/candidates/[id]/notes", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockValidateOrigin.mockReturnValue(null);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
    candidateLookupBuilder.maybeSingle.mockResolvedValue({ data: { id: "123" }, error: null });
    notesQueryBuilder.range.mockResolvedValue({ data: [], error: null });
    profilesBuilder.in.mockResolvedValue({ data: [], error: null });
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Test note" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(401);
  });

  it("creates a note successfully", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    notesQueryBuilder.insert.mockReturnValue(notesInsertBuilder);
    notesInsertBuilder.select.mockReturnValue(notesInsertBuilder);
    notesInsertBuilder.single.mockResolvedValue({
      data: {
        id: 1,
        candidate_id: "123",
        body: "Test note",
        author_id: recruiterCtx.userId,
        created_at: "2024-01-01T00:00:00Z",
      },
      error: null,
    });

    const { POST } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "Test note", jobId: "00000000-0000-4000-8000-000000000001" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.note).toBeDefined();
  });

  it("returns 422 for invalid body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: "" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/candidates/[id]/notes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/123/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "123" }) });
    expect(res.status).toBe(400);
  });
});
