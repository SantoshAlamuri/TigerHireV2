import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  recruiterCtx,
  candidateCtx,
  companyAdminCtx,
  createTenantScopedClientMock,
} from "../helpers";

const mockGetAuthContext = vi.fn();
const mockGetTenantScopedClient = vi.fn(async () => createTenantScopedClientMock());
vi.mock("@/lib/screening/fetch-application-screening-display", () => ({
  fetchApplicationScreeningAnswersForDisplay: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: vi.fn().mockReturnValue(null),
}));
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  getTenantScopedClient: (...args: unknown[]) => mockGetTenantScopedClient(...args),
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

const mockGetById = vi.fn();
vi.mock("@/lib/repositories/ApplicationRepository", () => ({
  ApplicationRepository: { getById: (...args: unknown[]) => mockGetById(...args) },
}));

const mockUpdateStatus = vi.fn();
vi.mock("@/lib/services/ApplicationService", () => ({
  ApplicationService: { updateStatus: (...args: unknown[]) => mockUpdateStatus(...args) },
}));

/**
 * The reject-reason write uses the request-scoped client, which every other
 * test in this file was happy to leave as `{}`. Defaulting to a builder that
 * succeeds and records its arguments keeps those tests behaving identically
 * while letting the reason assertions see what was actually written.
 */
const mockServerUpdate = vi.fn();
const mockServerFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () =>
    Promise.resolve({ from: (...args: unknown[]) => mockServerFrom(...args) }),
}));

const mockAdminFrom = vi.fn();
const mockGetUserById = vi.fn().mockResolvedValue({
  data: { user: { email: "r@test.com" } },
  error: null,
});
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    auth: {
      admin: {
        getUserById: (...args: unknown[]) => mockGetUserById(...args),
      },
    },
  }),
}));

vi.mock("@/lib/repositories/NotificationRepository", () => ({
  NotificationRepository: { create: vi.fn().mockResolvedValue(undefined) },
}));

const mockSendApplicationWithdrawnToRecruiter = vi.fn().mockResolvedValue(undefined);
const mockSendApplicationStatusUpdate = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/resend", () => ({
  sendApplicationWithdrawnToRecruiter: (...args: unknown[]) =>
    mockSendApplicationWithdrawnToRecruiter(...args),
  sendApplicationStatusUpdate: (...args: unknown[]) => mockSendApplicationStatusUpdate(...args),
}));

const mockNotifyCandidateShortlisted = vi.fn().mockResolvedValue(undefined);
const mockNotifyCandidateRejected = vi.fn().mockResolvedValue(undefined);
const mockNotifyCandidateOffer = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/services/whatsapp", () => ({
  notifyCandidateShortlisted: (...args: unknown[]) => mockNotifyCandidateShortlisted(...args),
  notifyCandidateRejected: (...args: unknown[]) => mockNotifyCandidateRejected(...args),
  notifyCandidateOffer: (...args: unknown[]) => mockNotifyCandidateOffer(...args),
}));

vi.mock("@/lib/security/csrf", () => ({ validateOrigin: () => null }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

/** Records `.update(payload).eq("id", …)` so a test can assert what was written. */
function makeUpdateBuilder() {
  return {
    update: (payload: unknown) => {
      mockServerUpdate(payload);
      return { eq: vi.fn().mockResolvedValue({ error: null }) };
    },
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

function makeSingleRowBuilder(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe("GET /api/applications/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockGetById.mockReset();
    mockAdminFrom.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { GET } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1");
    const res = await GET(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetById.mockResolvedValue(null);
    const { GET } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-missing");
    const res = await GET(req, { params: Promise.resolve({ id: "app-missing" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with application when found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "c-1",
      status: "applied",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    const { GET } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1");
    const res = await GET(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application).toBeDefined();
    expect(body.application.id).toBe("app-1");
  });
});

describe("PATCH /api/applications/[id]", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockUpdateStatus.mockReset();
    mockAdminFrom.mockReset();
    mockGetUserById.mockReset();
    mockSendApplicationWithdrawnToRecruiter.mockReset();
    mockSendApplicationStatusUpdate.mockReset();
    mockNotifyCandidateShortlisted.mockReset();
    mockNotifyCandidateRejected.mockReset();
    mockNotifyCandidateOffer.mockReset();
    mockGetUserById.mockResolvedValue({
      data: { user: { email: "r@test.com" } },
      error: null,
    });
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "applied",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    mockAdminFrom.mockImplementation(() => makeSingleRowBuilder(null));
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when candidate tries to set status other than withdrawn", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 403 when non-recruiter tries to update status to shortlisted", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 422 when body fails validation", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid_status" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(422);
  });

  it("returns 400 for malformed JSON body", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 200 when recruiter updates status to shortlisted", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "c-1",
      status: "shortlisted",
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.application).toBeDefined();
    expect(body.application.status).toBe("shortlisted");
  });

  it("notifies candidate on WhatsApp and email when status changes", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "shortlisted",
    });
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "candidates") {
        return makeSingleRowBuilder({
          email: "candidate@test.com",
          name: "Priya",
          phone: "+919999999999",
        });
      }
      if (table === "jobs") {
        return makeSingleRowBuilder({
          title: "Frontend Engineer",
          organisation_id: "org-1",
        });
      }
      if (table === "organisations") {
        return makeSingleRowBuilder({ name: "Acme" });
      }
      return makeSingleRowBuilder(null);
    });

    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "shortlisted" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
    expect(mockSendApplicationStatusUpdate).toHaveBeenCalledTimes(1);
    expect(mockNotifyCandidateShortlisted).toHaveBeenCalledTimes(1);
    expect(mockNotifyCandidateRejected).not.toHaveBeenCalled();
    expect(mockNotifyCandidateOffer).not.toHaveBeenCalled();
  });

  it("returns 200 when leadership updates status", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "c-1",
      status: "hired",
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "hired" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
  });

  it("returns 200 when agency updates status", async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: "user-agency-1",
      role: "agency",
      organisationId: "org-agency-1",
    });
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "c-1",
      status: "rejected",
    });
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "applied",
      jobs: { organisation_id: "org-agency-1", hiring_manager_id: null },
      candidates: { user_id: "user-candidate-1" },
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "rejected" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
  });

  it("restores a hold from viewed to applied", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "viewed",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "c-1",
      status: "applied",
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(200);
    expect(mockUpdateStatus).toHaveBeenCalledWith(
      expect.anything(),
      "app-1",
      "applied",
      expect.anything(),
    );
    expect(mockSendApplicationStatusUpdate).not.toHaveBeenCalled();
  });

  it("refuses to restore a shortlist to applied", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "shortlisted",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(409);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("refuses to restore a reject to applied", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "rejected",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "applied" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
    expect(res.status).toBe(409);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });
});

/**
 * The reject reason used to be validated and then silently dropped: no field on
 * the update schema, so Zod stripped it before anything could write it. Three
 * screens read that column — the talent pool grouped by reason, the fairness
 * report's reason distribution, and the agency close-reason — and all three
 * rendered empty for every row, which reads as "nobody gave reasons" rather
 * than "the product threw them away".
 */
describe("PATCH /api/applications/[id] — reject reason", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockUpdateStatus.mockReset();
    mockGetById.mockReset();
    mockServerFrom.mockReset();
    mockServerUpdate.mockReset();
    mockAdminFrom.mockImplementation(() => makeSingleRowBuilder(null));
    mockServerFrom.mockImplementation(() => makeUpdateBuilder());
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "rejected",
    });
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "applied",
      rejection_reason: null,
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
  });

  async function patch(body: unknown) {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const req = new NextRequest("http://localhost:3000/api/applications/app-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return PATCH(req, { params: Promise.resolve({ id: "app-1" }) });
  }

  it("persists the reason and returns it on the application", async () => {
    const res = await patch({ status: "rejected", rejection_reason: "compensation" });
    expect(res.status).toBe(200);
    expect(mockServerFrom).toHaveBeenCalledWith("applications");
    expect(mockServerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ rejection_reason: "compensation" }),
    );
    const body = await res.json();
    expect(body.application.rejection_reason).toBe("compensation");
  });

  it("rejects a reason outside the closed list", async () => {
    // Free text cannot be grouped, so it would make the fairness report look
    // sparse while the rejections kept happening.
    const res = await patch({ status: "rejected", rejection_reason: "vibes" });
    expect(res.status).toBe(422);
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });

  it("refuses a reason attached to any status but rejected", async () => {
    const res = await patch({ status: "shortlisted", rejection_reason: "compensation" });
    expect(res.status).toBe(422);
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });

  it("clears a stale reason when a rejected application is un-rejected", async () => {
    mockGetById.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "rejected",
      rejection_reason: "compensation",
      jobs: { organisation_id: "org-1", hiring_manager_id: "hm-1" },
      candidates: { user_id: "user-candidate-1" },
    });
    mockUpdateStatus.mockResolvedValue({
      id: "app-1",
      job_id: "job-1",
      candidate_id: "cand-1",
      status: "shortlisted",
    });
    const res = await patch({ status: "shortlisted" });
    expect(res.status).toBe(200);
    // Left behind, the reason would keep surfacing a live candidate in the
    // talent pool as though they had been passed over.
    expect(mockServerUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ rejection_reason: null }),
    );
  });

  it("does not write when there is no reason and none to clear", async () => {
    await patch({ status: "shortlisted" });
    expect(mockServerUpdate).not.toHaveBeenCalled();
  });
});
