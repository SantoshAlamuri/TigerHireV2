import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
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

const mockFetchPageText = vi.fn();
vi.mock("@/lib/services/fetch-page-text", () => ({
  fetchPageText: (...args: unknown[]) => mockFetchPageText(...args),
}));

const mockParseJobDescription = vi.fn();
vi.mock("@/lib/services/anthropic", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/services/anthropic")>();
  return {
    ...actual,
    parseJobDescription: (...args: unknown[]) => mockParseJobDescription(...args),
  };
});

vi.mock("@/lib/config/env", () => ({
  env: { anthropicApiKey: "test-api-key" },
}));

vi.mock("nanoid", () => ({
  nanoid: () => "sec-5678",
}));

vi.mock("@/lib/observability/report-error", () => ({
  reportError: vi.fn(),
}));

describe("POST /api/jobs/parse-jd-url", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockFetchPageText.mockReset();
    mockParseJobDescription.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const { POST } = await import("@/app/api/jobs/parse-jd-url/route");
    const req = new NextRequest("http://localhost/api/jobs/parse-jd-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/job" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { POST } = await import("@/app/api/jobs/parse-jd-url/route");
    const req = new NextRequest("http://localhost/api/jobs/parse-jd-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/job" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
  });

  it("returns 400 when URL is invalid", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const { POST } = await import("@/app/api/jobs/parse-jd-url/route");
    const req = new NextRequest("http://localhost/api/jobs/parse-jd-url", {
      method: "POST",
      body: JSON.stringify({ url: "not-a-url" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid URL");
  });

  it("returns 200 with parsed job details", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFetchPageText.mockResolvedValue(
      "  We need a platform engineer focused on reliability, observability, cloud infra, and automation.  ",
    );
    mockParseJobDescription.mockResolvedValue({
      titleNormalised: "Platform Engineer",
      location: "Remote",
      roleFunction: "Engineering",
      seniorityLevel: "Senior",
      remoteAllowed: true,
      salaryMin: 18,
      salaryMax: 28,
      experienceMin: 5,
      experienceMax: 9,
      summary: "Platform role for reliability",
      sections: [{ label: "Core Skills", type: "tags", value: ["Kubernetes", "Terraform"] }],
    });

    const { POST } = await import("@/app/api/jobs/parse-jd-url/route");
    const req = new NextRequest("http://localhost/api/jobs/parse-jd-url", {
      method: "POST",
      body: JSON.stringify({ url: "https://example.com/job-posting" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockFetchPageText).toHaveBeenCalledWith("https://example.com/job-posting");
    expect(body.metadata.title).toBe("Platform Engineer");
    expect(body.metadata.compensationMax).toBe(2800000);
    expect(body.sections[0].id).toBe("sec-5678");
  });
});
