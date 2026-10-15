import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx } from "../helpers";

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
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (_err: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockCheckRateLimit = vi.fn();
vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, userId, organisationId, ip }: any) =>
    `${route}:${organisationId ?? userId ?? ip ?? "anon"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

const mockGenerateJobFromPrompt = vi.fn();
vi.mock("@/lib/services/anthropic", () => ({
  generateJobFromPrompt: (...args: unknown[]) => mockGenerateJobFromPrompt(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("POST /api/jobs/generate-jd", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockCheckRateLimit.mockReset();
    mockGenerateJobFromPrompt.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: new Date() });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "Senior engineer role" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "Senior engineer role" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 422 when prompt is too short", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "short" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain(">=10 characters");
  });

  it("returns 422 when prompt is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({}),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
  });

  it("returns 422 when prompt exceeds 15000 characters", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const longPrompt = "a".repeat(15001);
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: longPrompt }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain("<=15000 characters");
  });

  it("returns 429 when rate limited", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockCheckRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: new Date() });
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "A senior backend engineer who knows Python and AWS" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("rate limit");
  });

  it("returns 200 with generated JD on success", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockGenerateJobFromPrompt.mockResolvedValue({
      titleNormalised: "Senior Backend Engineer",
      description: "We are looking for a senior backend engineer...",
      location: "Bangalore",
      roleFunction: "Engineering",
      seniorityLevel: "Senior",
      remoteAllowed: true,
      salaryMin: 15,
      salaryMax: 25,
      experienceMin: 5,
      experienceMax: 8,
      summary: "A senior backend role",
      sections: [
        { label: "Technical Skills", type: "tags", value: ["Python", "AWS"] },
        { label: "Preferred Skills", type: "list", value: ["Docker"] },
      ],
    });

    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "A senior backend engineer who knows Python and AWS" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.metadata.title).toBe("Senior Backend Engineer");
    expect(body.metadata.remoteAllowed).toBe(true);
    expect(body.metadata.compensationMin).toBe(1500000);
    expect(body.metadata.compensationMax).toBe(2500000);
    expect(body.sections).toHaveLength(2);
    expect(body.sections[0].label).toBe("Technical Skills");
    expect(body.rawText).toBe("We are looking for a senior backend engineer...");
  });

  it("returns 500 on AI service error", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGenerateJobFromPrompt.mockRejectedValue(new Error("AI service unavailable"));
    const { POST } = await import("@/app/api/jobs/generate-jd/route");
    const req = new NextRequest("http://localhost/api/jobs/generate-jd", {
      method: "POST",
      body: JSON.stringify({ prompt: "A senior backend engineer who knows Python and AWS" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
