import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockGetAuthContext = vi.fn();
const mockCreateSupabaseServerClient = vi.fn();
const mockAssertCanAccessCandidateResumes = vi.fn().mockResolvedValue(undefined);
const mockWriteAccessAuditEvent = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  jsonSuccess: (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  handleApiError: (_error: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
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
    constructor(msg: string) {
      super(msg);
      this.name = "NotFoundError";
    }
  },
}));

vi.mock("@/lib/security/access-audit", () => ({
  writeAccessAuditEvent: (...args: unknown[]) => mockWriteAccessAuditEvent(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const mockCreateCvStorageSignedUrl = vi.fn();

vi.mock("@/lib/supabase/cv-signed-url", () => ({
  createCvStorageSignedUrl: (...args: unknown[]) => mockCreateCvStorageSignedUrl(...args),
}));

function buildRouteSupabase({
  row = {
    id: "rv-1",
    file_url:
      "https://example.supabase.co/storage/v1/object/public/resumes/user-candidate-1/rv-1.pdf",
    storage_path: "user-candidate-1/rv-1.pdf",
  },
  rowError = null,
  signedData = { signedUrl: "https://example.com/signed/user-candidate-1/rv-1.pdf" },
  signError = null,
}: {
  row?: unknown;
  rowError?: unknown;
  signedData?: { signedUrl?: string | null } | null;
  signError?: unknown;
} = {}) {
  const resumeVersionsBuilder = createMockQueryBuilder({
    data: row,
    error: rowError,
  });
  const supabase = createMockSupabase({
    resume_versions: resumeVersionsBuilder,
  });
  (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
    createSignedUrl: vi.fn().mockResolvedValue({ data: signedData, error: signError }),
  });
  return supabase;
}

describe("GET /api/candidates/[id]/resumes/[versionId]/signed-url", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockCreateSupabaseServerClient.mockReset();
    mockAssertCanAccessCandidateResumes.mockReset();
    mockWriteAccessAuditEvent.mockReset();
    mockCreateCvStorageSignedUrl.mockReset();

    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockAssertCanAccessCandidateResumes.mockResolvedValue(undefined);
    mockWriteAccessAuditEvent.mockResolvedValue(undefined);
    mockCreateCvStorageSignedUrl.mockResolvedValue({
      url: "https://example.com/signed/user-candidate-1/rv-1.pdf",
      expiresAt: new Date(Date.now() + 900_000).toISOString(),
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/candidates/[id]/resumes/[versionId]/signed-url/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1/signed-url", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: "c1", versionId: "rv-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 403 for unauthorized role", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-viewer-1",
      role: "viewer",
      organisationId: "org-1",
    });

    const { GET } = await import("@/app/api/candidates/[id]/resumes/[versionId]/signed-url/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1/signed-url", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: "c1", versionId: "rv-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 404 when resume version is missing", async () => {
    const supabase = buildRouteSupabase({ row: null });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/resumes/[versionId]/signed-url/route");
    const req = new NextRequest(
      "http://localhost:3000/api/candidates/c1/resumes/rv-missing/signed-url",
      { method: "GET" },
    );

    const res = await GET(req, { params: Promise.resolve({ id: "c1", versionId: "rv-missing" }) });

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "CV version not found" });
  });

  it("returns 500 when signed URL creation fails", async () => {
    const supabase = buildRouteSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);
    mockCreateCvStorageSignedUrl.mockResolvedValue(null);

    const { GET } = await import("@/app/api/candidates/[id]/resumes/[versionId]/signed-url/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1/signed-url", {
      method: "GET",
    });

    const res = await GET(req, { params: Promise.resolve({ id: "c1", versionId: "rv-1" }) });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Failed to generate link" });
  });

  it("returns 200 with signed URL response shape", async () => {
    const supabase = buildRouteSupabase();
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/candidates/[id]/resumes/[versionId]/signed-url/route");
    const req = new NextRequest("http://localhost:3000/api/candidates/c1/resumes/rv-1/signed-url", {
      method: "GET",
      headers: {
        "x-forwarded-for": "203.0.113.1",
        "user-agent": "vitest",
      },
    });

    const res = await GET(req, { params: Promise.resolve({ id: "c1", versionId: "rv-1" }) });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      url: expect.any(String),
      expiresAt: expect.any(String),
      expiresIn: 900,
    });
    expect(Number.isNaN(Date.parse(body.expiresAt))).toBe(false);
    expect(mockWriteAccessAuditEvent).toHaveBeenCalledTimes(1);
  });
});
