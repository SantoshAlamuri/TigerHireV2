import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAuthContext = vi.fn();
const mockAssertJobAccess = vi.fn();
const mockJobGetById = vi.fn();
const mockCallClaude = vi.fn();
const mockExtractJsonObject = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => Boolean(ctx),
  hasRole: (_ctx: unknown, ...roles: string[]) => roles.includes("recruiter"),
  getTenantScopedClient: () =>
    Promise.resolve({
      assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
      raw: {},
    }),
  jsonError: (message: string, status: number) =>
    new Response(JSON.stringify({ error: message }), { status }),
  jsonSuccess: (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status }),
  handleApiError: (_error: unknown, message: string) =>
    new Response(JSON.stringify({ error: message }), { status: 500 }),
}));

vi.mock("@/lib/services/JobService", () => ({
  JobService: {
    getById: (...args: unknown[]) => mockJobGetById(...args),
  },
}));

vi.mock("@/lib/services/anthropic", () => ({
  callClaude: (...args: unknown[]) => mockCallClaude(...args),
  extractJsonObject: (...args: unknown[]) => mockExtractJsonObject(...args),
}));

describe("GET /api/jobs/[id]/bias", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockAssertJobAccess.mockReset();
    mockJobGetById.mockReset();
    mockCallClaude.mockReset();
    mockExtractJsonObject.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/jobs/[id]/bias/route");
    const response = await GET(new Request("http://localhost/api/jobs/1/bias") as any, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when JD text is empty", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockAssertJobAccess.mockResolvedValue(true);
    mockJobGetById.mockResolvedValue({ title: "", description: "", skills_required: [] });

    const { GET } = await import("@/app/api/jobs/[id]/bias/route");
    const response = await GET(new Request("http://localhost/api/jobs/1/bias") as any, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(String(body.error)).toMatch(/Job description is empty/i);
  });

  it("returns normalized bias analysis result", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      role: "recruiter",
      organisationId: "org-1",
    });
    mockAssertJobAccess.mockResolvedValue(true);
    mockJobGetById.mockResolvedValue({
      title: "Support Lead",
      description: "Need strong communicator.",
      skills_required: ["Customer empathy"],
    });
    mockCallClaude.mockResolvedValue({ text: '{"summary":"done"}' });
    mockExtractJsonObject.mockReturnValue({
      summary: "Potentially biased language detected.",
      score: 82.7,
      issues: [
        {
          category: "Culture fit bias",
          severity: "HIGH",
          snippet: "culture fit ninja",
          why: "Can introduce affinity bias.",
          suggestion: "Replace with objective collaboration requirements.",
        },
      ],
    });

    const { GET } = await import("@/app/api/jobs/[id]/bias/route");
    const response = await GET(new Request("http://localhost/api/jobs/1/bias") as any, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.summary).toBe("Potentially biased language detected.");
    expect(body.result.score).toBe(83);
    expect(body.result.issues).toHaveLength(1);
    expect(body.result.issues[0].severity).toBe("high");
  });
});
