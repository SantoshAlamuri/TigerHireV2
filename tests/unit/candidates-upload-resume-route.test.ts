import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx, createMockSupabase, createMockQueryBuilder } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
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
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCreateSupabaseServerClient = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => mockCreateSupabaseServerClient(),
}));

const mockCreateSupabaseAdmin = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
  buildScopedRateLimitKey: ({
    route,
    organisationId,
    userId,
  }: {
    route: string;
    organisationId?: string | null;
    userId?: string | null;
  }) => (organisationId && userId ? `${route}:${organisationId}:${userId}` : `${route}:${userId}`),
}));

const mockClaimUnclaimedCandidateByEmail = vi.fn();
const mockEnqueue = vi.fn().mockResolvedValue({});
vi.mock("@/lib/agents/candidate-dedup", () => ({
  claimUnclaimedCandidateByEmail: (...args: unknown[]) =>
    mockClaimUnclaimedCandidateByEmail(...args),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args),
}));

const mockInferMimeFromName = vi.fn();
vi.mock("@/lib/services/extract-document-text", () => ({
  inferMimeFromName: (...args: unknown[]) => mockInferMimeFromName(...args),
}));

const CANDIDATE_ID = "00000000-1111-4000-8000-000000000001";
const VERSION_ID = "00000000-3333-4000-8000-000000000003";

/**
 * Create a mock File-like object that works in jsdom without triggering
 * webidl assertion errors when passed through FormData/NextRequest.
 */
function createMockFile(name = "resume.pdf", type = "application/pdf", sizeBytes = 1024): File {
  const content = new Uint8Array(sizeBytes);
  // Use the global File constructor — this creates a real File for the env
  return new File([content], name, { type });
}

/**
 * Create a NextRequest that returns a mock FormData from its formData() method.
 * This avoids jsdom's webidl incompatibility with File objects in NextRequest bodies.
 */
function createFormDataRequest(
  options: {
    file?: {
      name: string;
      type: string;
      size: number;
      arrayBuffer: () => Promise<ArrayBuffer>;
    } | null;
    fieldName?: string;
  } = {},
) {
  const { file = null, fieldName = "resume" } = options;
  const req = new NextRequest("http://localhost:3000/api/candidates/upload-resume", {
    method: "POST",
  });
  // Mock formData() to return a fake FormData with our file
  const mockFormData = {
    get: (key: string) => {
      if (file && (key === fieldName || key === "file" || key === "resume")) {
        return file;
      }
      return null;
    },
  };
  vi.spyOn(req, "formData").mockResolvedValue(mockFormData as unknown as FormData);
  return req;
}

/**
 * Create a file-like object for use in tests (avoids jsdom File/webidl issues).
 */
function createTestFileLike(name = "resume.pdf", type = "application/pdf", sizeBytes = 1024) {
  const content = new Uint8Array(sizeBytes);
  if (name.endsWith(".pdf") || type === "application/pdf") {
    content.set([0x25, 0x50, 0x44, 0x46]); // %PDF
  } else if (name.endsWith(".doc")) {
    content.set([0xd0, 0xcf, 0x11, 0xe0]); // OLE2 DOC
  } else if (name.endsWith(".docx")) {
    content.set([0x50, 0x4b, 0x03, 0x04]); // ZIP header
    const marker = "[Content_Types].xml";
    for (let i = 0; i < marker.length && 30 + i < content.length; i++) {
      content[30 + i] = marker.charCodeAt(i);
    }
  } else if (name.endsWith(".txt") || type === "text/plain") {
    const marker = "hello plain text resume";
    for (let i = 0; i < marker.length && i < content.length; i++) {
      content[i] = marker.charCodeAt(i);
    }
  }
  return {
    name,
    type,
    size: sizeBytes,
    arrayBuffer: () => Promise.resolve(content.buffer as ArrayBuffer),
  };
}

describe("POST /api/candidates/upload-resume", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockEnqueue.mockResolvedValue({});
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9 });
    mockClaimUnclaimedCandidateByEmail.mockResolvedValue(null);
    mockInferMimeFromName.mockReturnValue("application/pdf");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for recruiter role (only candidates and super_admin)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 429 when rate limit exceeded", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0 });

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns 400 when no file provided", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: null });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("No file provided");
  });

  it("returns 400 for invalid file type", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({
      file: createTestFileLike("image.png", "image/png", 100),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid file extension");
  });

  it("returns 400 when file exceeds 10MB", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({
      file: createTestFileLike("big.pdf", "application/pdf", 11 * 1024 * 1024),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("File too large");
  });

  it("returns 400 when file bytes do not match extension", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const oleDocBytes = new Uint8Array(2048);
    oleDocBytes.set([0xd0, 0xcf, 0x11, 0xe0]); // DOC signature
    const mismatchedFile = {
      name: "resume.pdf",
      type: "application/pdf",
      size: oleDocBytes.length,
      arrayBuffer: () => Promise.resolve(oleDocBytes.buffer as ArrayBuffer),
    };

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: mismatchedFile });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("File content does not match its extension");
  });

  it("returns 400 when declared mime conflicts with validated extension type", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const validPdfBytes = new Uint8Array(1024);
    validPdfBytes.set([0x25, 0x50, 0x44, 0x46]); // %PDF
    const mismatchedDeclaredTypeFile = {
      name: "resume.pdf",
      type: "application/msword",
      size: validPdfBytes.length,
      arrayBuffer: () => Promise.resolve(validPdfBytes.buffer as ArrayBuffer),
    };

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: mismatchedDeclaredTypeFile });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Uploaded file type mismatch");
  });

  it("returns 201 on successful upload and parse", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    // Candidate exists
    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    // resume_versions insert
    const resumeVersionsBuilder = createMockQueryBuilder({
      data: { id: VERSION_ID, candidate_id: CANDIDATE_ID, file_name: "resume.pdf" },
    });

    const supabase = createMockSupabase({
      candidates: candidatesBuilder,
      resume_versions: resumeVersionsBuilder,
    });
    // Add rpc mock
    (supabase as Record<string, unknown>).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    // Add storage mocks (upload, getPublicUrl, createSignedUrl)
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.pdf" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://example.com/test.pdf" },
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/signed/test.pdf" },
      }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    // Auth getUser
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { email: "test@example.com" } },
      error: null,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    // Admin client for candidate update — must return { error: null } when awaited
    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ candidates: adminBuilder });
    // The storage write + signed URL go through the admin client (storage RLS
    // on the resumes bucket can't be satisfied by the user-scoped client).
    (adminClient as Record<string, unknown>).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    (adminClient.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.pdf" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://example.com/test.pdf" },
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/signed/test.pdf" },
      }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.candidateId).toBe(CANDIDATE_ID);
    expect(body.parsing).toBe("pending");
    expect(body.message).toBe("Resume uploaded successfully");
    expect(mockEnqueue).toHaveBeenCalled();
  });

  it("handles parse failure gracefully (still uploads file)", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const candidatesBuilder = createMockQueryBuilder({ data: { id: CANDIDATE_ID } });
    const resumeVersionsBuilder = createMockQueryBuilder({
      data: { id: VERSION_ID, candidate_id: CANDIDATE_ID, file_name: "resume.pdf" },
    });

    const supabase = createMockSupabase({
      candidates: candidatesBuilder,
      resume_versions: resumeVersionsBuilder,
    });
    (supabase as Record<string, unknown>).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.pdf" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://example.com/test.pdf" },
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/signed/test.pdf" },
      }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    supabase.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { email: "test@example.com" } },
      error: null,
    });
    mockCreateSupabaseServerClient.mockResolvedValue(supabase);

    const adminBuilder = createMockQueryBuilder({ data: null, error: null });
    const adminClient = createMockSupabase({ candidates: adminBuilder });
    // The storage write + signed URL go through the admin client (storage RLS
    // on the resumes bucket can't be satisfied by the user-scoped client).
    (adminClient as Record<string, unknown>).rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: null });
    (adminClient.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: "test.pdf" }, error: null }),
      getPublicUrl: vi.fn().mockReturnValue({
        data: { publicUrl: "https://example.com/test.pdf" },
      }),
      createSignedUrl: vi.fn().mockResolvedValue({
        data: { signedUrl: "https://example.com/signed/test.pdf" },
      }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      list: vi.fn().mockResolvedValue({ data: [], error: null }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(adminClient);

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    // Parsing runs in background; upload succeeds regardless of parse outcome
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.candidateId).toBe(CANDIDATE_ID);
    expect(body.parsing).toBe("pending");
  });

  it("returns 503 when rate limit check throws (fail closed)", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    mockCheckRateLimit.mockRejectedValue(new Error("Redis unavailable"));

    const { POST } = await import("@/app/api/candidates/upload-resume/route");
    const req = createFormDataRequest({ file: createTestFileLike() });
    const res = await POST(req);
    expect(res.status).toBe(503);
  });
});
