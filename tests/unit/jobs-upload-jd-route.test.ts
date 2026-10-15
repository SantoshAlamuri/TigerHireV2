import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx } from "../helpers";

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
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId }: Record<string, string>) =>
    `${route}:${organisationId ?? userId ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockParseJobDescription = vi.fn();
vi.mock("@/lib/services/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/anthropic")>();
  return {
    ...actual,
    parseJobDescription: (...args: unknown[]) => mockParseJobDescription(...args),
  };
});

const mockExtractTextFromFile = vi.fn();
const mockInferMimeFromName = vi.fn();
vi.mock("@/lib/services/extract-document-text", () => ({
  extractTextFromFile: (...args: unknown[]) => mockExtractTextFromFile(...args),
  inferMimeFromName: (...args: unknown[]) => mockInferMimeFromName(...args),
  ALLOWED_JD_TYPES: [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
  MAX_JD_FILE_SIZE: 10 * 1024 * 1024,
}));

vi.mock("@/lib/config/env", () => ({
  env: { anthropicApiKey: "test-api-key" },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "sec-1234",
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

function buildMultipartRequest(file: File | null) {
  const req = new NextRequest("http://localhost/api/jobs/upload-jd", { method: "POST" });
  const fakeFormData = {
    get: (key: string) => (key === "file" ? file : null),
  };
  vi.spyOn(req, "formData").mockResolvedValue(fakeFormData as unknown as FormData);
  return req;
}

describe("POST /api/jobs/upload-jd", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockParseJobDescription.mockReset();
    mockExtractTextFromFile.mockReset();
    mockInferMimeFromName.mockReset();

    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
    mockInferMimeFromName.mockReturnValue("text/plain");
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const { POST } = await import("@/app/api/jobs/upload-jd/route");
    const req = buildMultipartRequest(
      new File(["Job description"], "jd.txt", { type: "text/plain" }),
    );
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { POST } = await import("@/app/api/jobs/upload-jd/route");
    const req = buildMultipartRequest(
      new File(["Job description"], "jd.txt", { type: "text/plain" }),
    );
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid file type", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const { POST } = await import("@/app/api/jobs/upload-jd/route");
    const req = buildMultipartRequest(new File(["fake image"], "jd.png", { type: "image/png" }));
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toContain("Invalid file type");
  });

  it("returns 200 with parsed job description", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockExtractTextFromFile.mockResolvedValue(
      "  We are hiring a staff backend engineer with Node.js, PostgreSQL, and distributed systems expertise.  ",
    );
    mockParseJobDescription.mockResolvedValue({
      titleNormalised: "Staff Backend Engineer",
      location: "Bengaluru",
      roleFunction: "Engineering",
      seniorityLevel: "Staff",
      remoteAllowed: true,
      salaryMin: 12,
      salaryMax: 20,
      experienceMin: 7,
      experienceMax: 11,
      summary: "Backend leadership role",
      sections: [{ label: "Must Have", type: "tags", value: ["Node.js", "PostgreSQL"] }],
    });

    const { POST } = await import("@/app/api/jobs/upload-jd/route");
    const req = buildMultipartRequest(new File(["irrelevant"], "jd.txt", { type: "text/plain" }));
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockParseJobDescription).toHaveBeenCalledWith(
      "We are hiring a staff backend engineer with Node.js, PostgreSQL, and distributed systems expertise.",
    );
    expect(body.metadata.title).toBe("Staff Backend Engineer");
    expect(body.metadata.compensationMin).toBe(1200000);
    expect(body.sections[0].id).toBe("sec-1234");
  });
});
