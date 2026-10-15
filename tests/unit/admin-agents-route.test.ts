import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { superAdminCtx, candidateCtx } from "../helpers";

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

const mockProcessUnprocessedSignals = vi.fn();
vi.mock("@/lib/agents/talent-scout", () => ({
  processUnprocessedSignals: (...args: unknown[]) => mockProcessUnprocessedSignals(...args),
}));

const mockRunFitScoreBatchAgent = vi.fn();
vi.mock("@/lib/agents/fitscore-agent", () => ({
  runFitScoreBatchAgent: (...args: unknown[]) => mockRunFitScoreBatchAgent(...args),
}));

const mockIsJdBaseApproved = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: (...args: unknown[]) => mockIsJdBaseApproved(...args),
  JD_BASE_NOT_APPROVED_MESSAGE:
    "JD Base awaiting hiring manager approval. Review weights and approve before scoring.",
}));

const mockTriggerScoutAgent = vi.fn();
vi.mock("@/lib/agents/scout", () => ({
  triggerScoutAgent: (...args: unknown[]) => mockTriggerScoutAgent(...args),
}));

const mockTriggerVerifyAgent = vi.fn();
vi.mock("@/lib/agents/verify", () => ({
  triggerVerifyAgent: (...args: unknown[]) => mockTriggerVerifyAgent(...args),
}));

const mockTriggerSchedulerAgent = vi.fn();
vi.mock("@/lib/agents/scheduler", () => ({
  triggerSchedulerAgent: (...args: unknown[]) => mockTriggerSchedulerAgent(...args),
}));

const mockStartVouchFlow = vi.fn();
vi.mock("@/lib/agents/vouch", () => ({
  startVouchFlow: (...args: unknown[]) => mockStartVouchFlow(...args),
}));

const mockCaptureConsentViaWhatsApp = vi.fn();
vi.mock("@/lib/agents/consent", () => ({
  captureConsentViaWhatsApp: (...args: unknown[]) => mockCaptureConsentViaWhatsApp(...args),
}));

const mockTriggerAutoReplyAgent = vi.fn();
vi.mock("@/lib/agents/auto-reply", () => ({
  triggerAutoReplyAgent: (...args: unknown[]) => mockTriggerAutoReplyAgent(...args),
}));

const mockTriggerMissingInfoAgent = vi.fn();
vi.mock("@/lib/agents/info-request", () => ({
  triggerMissingInfoAgent: (...args: unknown[]) => mockTriggerMissingInfoAgent(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("POST /api/admin/agents", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockProcessUnprocessedSignals.mockReset();
    mockRunFitScoreBatchAgent.mockReset();
    mockTriggerScoutAgent.mockReset();
    mockTriggerVerifyAgent.mockReset();
    mockTriggerSchedulerAgent.mockReset();
    mockStartVouchFlow.mockReset();
    mockCaptureConsentViaWhatsApp.mockReset();
    mockTriggerAutoReplyAgent.mockReset();
    mockTriggerMissingInfoAgent.mockReset();
    mockIsJdBaseApproved.mockReset();
    mockIsJdBaseApproved.mockResolvedValue(true);

    mockProcessUnprocessedSignals.mockResolvedValue({
      runId: "run-1",
      recordsProcessed: 1,
      recordsCreated: 1,
      recordsUpdated: 0,
      errors: [],
    });
    mockRunFitScoreBatchAgent.mockResolvedValue({
      runId: "run-2",
      recordsProcessed: 1,
      recordsCreated: 1,
      recordsUpdated: 0,
      errors: [],
    });
    mockTriggerSchedulerAgent.mockResolvedValue({ status: "scheduled" });
    mockTriggerAutoReplyAgent.mockResolvedValue({ sent: true });
    mockTriggerMissingInfoAgent.mockResolvedValue({ requested: true, missingFields: ["email"] });
  });

  it("returns 403 for non-super-admin", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/admin/agents/route");
    const req = new NextRequest("http://localhost/api/admin/agents", {
      method: "POST",
      body: JSON.stringify({ agent: "talent_scout" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("triggers verify agent", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/agents/route");
    const req = new NextRequest("http://localhost/api/admin/agents", {
      method: "POST",
      body: JSON.stringify({ agent: "verify", candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockTriggerVerifyAgent).toHaveBeenCalledWith("c-1");
  });

  it("returns 400 when scheduler payload is incomplete", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/agents/route");
    const req = new NextRequest("http://localhost/api/admin/agents", {
      method: "POST",
      body: JSON.stringify({ agent: "scheduler", candidateId: "c-1" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/agents/route");
    const req = new NextRequest("http://localhost/api/admin/agents", {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("triggers info_request agent", async () => {
    mockGetAuthContext.mockResolvedValue(superAdminCtx);
    const { POST } = await import("@/app/api/admin/agents/route");
    const req = new NextRequest("http://localhost/api/admin/agents", {
      method: "POST",
      body: JSON.stringify({ agent: "info_request", candidateId: "c-2" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mockTriggerMissingInfoAgent).toHaveBeenCalledWith("c-2");
  });
});
