import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, hiringManagerCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockAssertCanAccessCandidateResumes = vi.fn().mockResolvedValue(undefined);

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
  handleApiError: (err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/security/candidate-resume-access", () => ({
  assertCanAccessCandidateResumes: (...args: unknown[]) =>
    mockAssertCanAccessCandidateResumes(...args),
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = "ForbiddenError";
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(msg = "Candidate not found") {
      super(msg);
      this.name = "NotFoundError";
    }
  },
}));

vi.mock("@/lib/security/validate-storage-url", () => ({
  validateResumeFileUrl: () => null,
}));

const chainMock = (data: unknown = null, error: unknown = null) => {
  const m: Record<string, unknown> = {};
  for (const method of ["select", "insert", "update", "delete", "eq", "order", "range"]) {
    m[method] = vi.fn().mockReturnValue(m);
  }
  m.single = vi.fn().mockResolvedValue({ data, error });
  m.then = vi.fn((resolve: (v: unknown) => void) =>
    resolve({ data: data ? (Array.isArray(data) ? data : [data]) : [], error }),
  );
  return m;
};

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({
      from: vi.fn().mockReturnValue(chainMock({ id: "rv-1", file_name: "resume.pdf" })),
      rpc: vi.fn().mockResolvedValue({ data: "rv-1", error: null }),
      storage: {
        from: () => ({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: "https://storage.example.com/signed" },
            error: null,
          }),
        }),
      },
    }),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/security/access-audit", () => ({
  writeAccessAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    rpc: vi.fn().mockResolvedValue({ data: "rv-1", error: null }),
  }),
}));

describe("GET /api/candidates/[id]/resumes", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertCanAccessCandidateResumes.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 200 with versions", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { GET } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versions).toBeDefined();
  });

  it("returns 404 when candidate not found", async () => {
    const { NotFoundError } = await import("@/lib/security/candidate-resume-access");
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockAssertCanAccessCandidateResumes.mockRejectedValue(new NotFoundError("Candidate not found"));
    const { GET } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes");
    const res = await GET(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Candidate not found");
  });
});

describe("POST /api/candidates/[id]/resumes", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertCanAccessCandidateResumes.mockResolvedValue(undefined);
  });

  it("returns 403 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const { POST } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: "url", file_name: "resume.pdf" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 422 when file_url is missing", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_name: "resume.pdf" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 201 when version is created", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/candidates/[id]/resumes/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_url: "https://storage.example.com/resume-v2.pdf",
        file_name: "resume-v2.pdf",
        file_size: 102400,
        label: "March 2026",
        is_default: true,
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/candidates/[id]/resumes/[versionId] (set default)", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertCanAccessCandidateResumes.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/candidates/[id]/resumes/[versionId]/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1", {
      method: "PATCH",
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "c1", versionId: "rv-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when default is set", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/candidates/[id]/resumes/[versionId]/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1", {
      method: "PATCH",
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "c1", versionId: "rv-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/candidates/[id]/resumes/[versionId]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertCanAccessCandidateResumes.mockResolvedValue(undefined);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/candidates/[id]/resumes/[versionId]/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "c1", versionId: "rv-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 when non-default version is deleted", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { DELETE } = await import("@/app/api/candidates/[id]/resumes/[versionId]/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1", {
      method: "DELETE",
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "c1", versionId: "rv-1" }),
    });
    expect(res.status).toBe(200);
  });
});
