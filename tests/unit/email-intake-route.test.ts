import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mockFrom = vi.fn();
const mockSavePublicApplication = vi.fn();
const mockNotifyCvIngestedFromEmailIntake = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
  }),
}));

vi.mock("@/lib/agents/public-apply", () => ({
  savePublicApplication: (...args: unknown[]) => mockSavePublicApplication(...args),
}));

vi.mock("@/lib/acknowledgements/email-intake", () => ({
  notifyCvIngestedFromEmailIntake: (...args: unknown[]) =>
    mockNotifyCvIngestedFromEmailIntake(...args),
}));

vi.mock("@/lib/security/idempotency", () => ({
  withIdempotency: (_request: Request, _endpoint: string, handler: () => Promise<Response>) =>
    handler(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  buildScopedRateLimitKey: ({ route, ip }: { route: string; ip?: string | null }) =>
    `${route}:${ip ?? "unknown"}`,
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: vi.fn().mockResolvedValue(true),
  enqueuePendingJdApprovalPair: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/prescreen/scoring-guard", () => ({
  checkScoringGuard: vi.fn().mockResolvedValue({ block: false, gateStatus: null }),
}));

vi.mock("@/lib/whatsapp/screening-qa-flow", () => ({
  startCanonicalScreeningCollectionBestEffort: vi.fn().mockResolvedValue("none"),
}));

describe("POST /api/intake/email", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockSavePublicApplication.mockReset();
    mockNotifyCvIngestedFromEmailIntake.mockReset();
    mockNotifyCvIngestedFromEmailIntake.mockResolvedValue(undefined);
    mockCheckRateLimit.mockReset();
    mockCheckRateLimit.mockResolvedValue({ allowed: true });
    process.env.EMAIL_INTAKE_SECRET = "test-intake-secret";
  });

  it("returns 401 when intake secret is missing", async () => {
    const { POST } = await import("@/app/api/intake/email/route");
    const req = new NextRequest("http://localhost:3000/api/intake/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when job address does not include jobId", async () => {
    const { POST } = await import("@/app/api/intake/email/route");
    const req = new NextRequest("http://localhost:3000/api/intake/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-secret": "test-intake-secret",
        "idempotency-key": "email-intake-key-1",
      },
      body: JSON.stringify({
        to: "jobs@in.tigerhire.com",
        resumeBase64: Buffer.from("resume").toString("base64"),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 429 when intake rate limit is exceeded", async () => {
    mockCheckRateLimit.mockResolvedValue({ allowed: false });
    const { POST } = await import("@/app/api/intake/email/route");
    const req = new NextRequest("http://localhost:3000/api/intake/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-secret": "test-intake-secret",
      },
      body: JSON.stringify({
        to: "jobs+00000000-0000-4000-8000-000000000001@in.tigerhire.com",
        resumeBase64: Buffer.from("resume").toString("base64"),
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("ingests resume when job address and payload are valid", async () => {
    const jobBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          organisation_id: "org-1",
          title: "Backend Engineer",
          organisations: [{ name: "Acme" }],
        },
        error: null,
      }),
    };
    const appBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "app-1" },
        error: null,
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobBuilder;
      if (table === "applications") return appBuilder;
      return null;
    });
    mockSavePublicApplication.mockResolvedValue({
      candidateId: "cand-1",
      candidateName: "Jane Doe",
    });

    const { POST } = await import("@/app/api/intake/email/route");
    const req = new NextRequest("http://localhost:3000/api/intake/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-intake-secret": "test-intake-secret",
        "idempotency-key": "email-intake-key-2",
      },
      body: JSON.stringify({
        to: "jobs+00000000-0000-4000-8000-000000000001@in.tigerhire.com",
        from: "candidate@example.com",
        resumeBase64: Buffer.from("resume").toString("base64"),
        fileName: "candidate.pdf",
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockSavePublicApplication).toHaveBeenCalledTimes(1);
    expect(mockNotifyCvIngestedFromEmailIntake).toHaveBeenCalledOnce();
  });

  it("accepts bearer authorization and resend-style attachment payload", async () => {
    const jobBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: "00000000-0000-4000-8000-000000000001",
          organisation_id: "org-1",
          title: "Backend Engineer",
          organisations: [{ name: "Acme" }],
        },
        error: null,
      }),
    };
    const appBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: "app-2" },
        error: null,
      }),
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") return jobBuilder;
      if (table === "applications") return appBuilder;
      return null;
    });
    mockSavePublicApplication.mockResolvedValue({
      candidateId: "cand-2",
      candidateName: "John Doe",
    });

    const { POST } = await import("@/app/api/intake/email/route");
    const req = new NextRequest("http://localhost:3000/api/intake/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer test-intake-secret",
        "idempotency-key": "email-intake-key-3",
      },
      body: JSON.stringify({
        to: "jobs+00000000-0000-4000-8000-000000000001@in.tigerhire.com",
        from: "candidate@example.com",
        attachments: [
          {
            filename: "resume.pdf",
            contentType: "application/pdf",
            content: Buffer.from("resume").toString("base64"),
          },
        ],
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(mockSavePublicApplication).toHaveBeenCalledTimes(1);
    expect(mockNotifyCvIngestedFromEmailIntake).toHaveBeenCalledOnce();
  });
});
