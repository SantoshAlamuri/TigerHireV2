import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, superAdminCtx, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const applicationsBuilder = createMockQueryBuilder({ data: [], error: null });
const defaultBuilder = createMockQueryBuilder({ data: [], error: null });
const mockSupabaseAdmin = {
  from: vi.fn((table: string) => {
    if (table === "applications") return applicationsBuilder;
    return defaultBuilder;
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockWriteAccessAuditBatch = vi.fn();
vi.mock("@/lib/security/access-audit", () => ({
  writeAccessAuditBatch: (...args: unknown[]) => mockWriteAccessAuditBatch(...args),
}));

describe("GET /api/export", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 5, resetAt: new Date() });
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=candidates");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=candidates");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid export type", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid export type");
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=candidates");
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it("returns CSV for candidates export", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    mockSupabaseAdmin
      .from()
      .select()
      .order()
      .limit.mockResolvedValue({
        data: [
          {
            name: "John Doe",
            email: "john@example.com",
            phone: "1234567890",
            location: "New York",
            current_role: "Engineer",
            current_company: "Tech Corp",
            experience_years: 5,
            skills: ["JavaScript", "TypeScript"],
            intent_score: 85,
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
        error: null,
      });

    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=candidates");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
    expect(res.headers.get("Content-Disposition")).toContain("candidates-export");
    const csv = await res.text();
    expect(csv).toContain("Name");
    expect(csv).toContain("Email");
    expect(csv).toContain("John Doe");
  });

  it("returns CSV for applications export", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockSupabaseAdmin.from().select().order().limit.mockResolvedValue({
      data: [],
      error: null,
    });

    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=applications");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
  });

  it("returns CSV for pipeline export", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockSupabaseAdmin.from().select().order().limit.mockResolvedValue({
      data: [],
      error: null,
    });

    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=pipeline");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/csv");
  });

  // --- PII-002: applications + pipeline exports must write access audits ---

  it("writes a view_pii access audit for applications export (PII-002)", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const rows = [
      {
        status: "applied",
        applied_at: "2024-01-01T00:00:00Z",
        viewed_at: null,
        cover_note: null,
        candidates: { id: "cand-1", name: "John Doe" },
        jobs: { title: "Engineer", organisations: { name: "Acme" } },
      },
      {
        status: "applied",
        applied_at: "2024-01-02T00:00:00Z",
        viewed_at: null,
        cover_note: null,
        candidates: { id: "cand-2", name: "Jane Roe" },
        jobs: { title: "Designer", organisations: { name: "Acme" } },
      },
    ];
    mockSupabaseAdmin.from.mockImplementation(() =>
      createMockQueryBuilder({ data: rows, error: null }),
    );

    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=applications");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockWriteAccessAuditBatch).toHaveBeenCalledTimes(1);
    const [userId, candidateIds, action, metadata] = mockWriteAccessAuditBatch.mock.calls[0];
    expect(userId).toBe(superAdminCtx.userId);
    expect(candidateIds).toEqual(["cand-1", "cand-2"]);
    expect(action).toBe("view_pii");
    expect(metadata).toMatchObject({ export_type: "applications", scope: "super_admin" });
  });

  it("writes a view_pii access audit for pipeline export (PII-002)", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const rows = [
      {
        stage_id: null,
        status: "active",
        interview_scheduled_at: null,
        interview_outcome: null,
        recruiter_rating: null,
        created_at: "2024-01-01T00:00:00Z",
        candidates: { id: "cand-9", name: "Pat Lee" },
        jobs: { id: "job-1", title: "Engineer", organisation_id: "org-1" },
      },
    ];
    mockSupabaseAdmin.from.mockImplementation(() =>
      createMockQueryBuilder({ data: rows, error: null }),
    );

    const { GET } = await import("@/app/api/export/route");
    const req = new NextRequest("http://localhost:3000/api/export?type=pipeline");
    const res = await GET(req);
    expect(res.status).toBe(200);

    expect(mockWriteAccessAuditBatch).toHaveBeenCalledTimes(1);
    const [, candidateIds, action, metadata] = mockWriteAccessAuditBatch.mock.calls[0];
    expect(candidateIds).toEqual(["cand-9"]);
    expect(action).toBe("view_pii");
    expect(metadata).toMatchObject({ export_type: "pipeline", scope: "super_admin" });
  });
});
