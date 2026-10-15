import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";
import {
  createInterviewBookMockAdmin,
  mockInterviewBookRpcSuccess,
  resetInterviewBookAdminRpc,
} from "../helpers/mock-interview-book-admin";

const recruiterCtx = {
  userId: "u1",
  role: "recruiter" as const,
  organisationId: "org-1",
};

vi.mock("@/lib/api-helpers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-helpers")>("@/lib/api-helpers");
  return {
    ...actual,
    getAuthContext: vi.fn(),
    requireAuth: (ctx: unknown) => !!ctx,
    hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
    jsonError: (msg: string, status: number) =>
      new Response(JSON.stringify({ error: msg }), { status }),
    jsonSuccess: (data: unknown, status?: number) =>
      new Response(JSON.stringify(data), { status: status ?? 200 }),
  };
});

const mockRunBookedDelivery = vi.fn();
vi.mock("@/lib/interviews/run-booked-delivery", () => ({
  runBookedInterviewDelivery: (...args: unknown[]) => mockRunBookedDelivery(...args),
}));

vi.mock("@/lib/interviews/build-booked-invite-context", () => ({
  buildBookedInviteContext: vi.fn().mockResolvedValue({
    jobId: "job-1",
    slotId: "s1",
    slotStartAt: "2026-03-01T10:00:00Z",
    slotEndAt: "2026-03-01T10:30:00Z",
  }),
}));

vi.mock("@/lib/job-access", () => ({
  assertJobAccess: vi.fn(
    async (_supabase: unknown, ctx: { organisationId?: string | null }, jobId: string) => ({
      job: {
        id: jobId,
        organisation_id: ctx.organisationId ?? "org-1",
        hiring_manager_id: null,
      },
    }),
  ),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(() => createInterviewBookMockAdmin()),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/services/resend", () => ({
  sendInterviewBooked: vi.fn().mockResolvedValue(undefined),
  sendInterviewCancelled: vi.fn().mockResolvedValue(undefined),
  sendInterviewRescheduled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendInterviewRescheduledTemplate: vi.fn().mockResolvedValue(undefined),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

describe("POST /api/jobs/[id]/interviews/book", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    resetInterviewBookAdminRpc();
    mockInterviewBookRpcSuccess("2026-03-01T10:00:00Z", "2026-03-01T10:30:00Z");
    mockRunBookedDelivery.mockResolvedValue({
      delivery: {
        candidate_email_status: "sent",
        interviewer_email_status: "sent",
        candidate_whatsapp_status: "not_applicable",
        last_delivery_attempt_at: "2026-05-17T10:00:00Z",
      },
      has_delivery_failure: false,
      failed_channels: [],
      channel_results: {},
    });
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/book", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when slot_id or pipeline_candidate_id missing", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation(() => ({}));
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/book", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 201 and booking when slot and pipeline candidate exist", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    const slotData = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "available",
    };
    const pcData = { id: "pc1", job_id: "job-1" };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: slotData, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: pcData, error: null }),
              }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      return createMockQueryBuilder();
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/book", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.slot_id).toBe("s1");
    expect(body.pipeline_candidate_id).toBe("pc1");
    expect(body.interview_scheduled_at).toBe("2026-03-01T10:00:00Z");
  });
});

describe("POST /api/jobs/[id]/interviews/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when slot_id missing", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation(() => ({}));
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 200 and cancelled when slot is booked", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    const slotData = {
      id: "s1",
      job_id: "job-1",
      status: "booked",
      pipeline_candidate_id: "pc1",
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: slotData, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      if (table === "pipeline_candidates")
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      return createMockQueryBuilder();
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.cancelled).toBe(true);
    expect(body.slot_id).toBe("s1");
  });

  it("returns 409 when slot is not booked", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    const slotData = {
      id: "s1",
      job_id: "job-1",
      status: "available",
      pipeline_candidate_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots")
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: slotData, error: null }),
              }),
            }),
          }),
        };
      return createMockQueryBuilder();
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(409);
  });
});

describe("POST /api/jobs/[id]/interviews/reschedule", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });

  it("returns 400 when slot_id or new_slot_id missing", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation(() => ({}));
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("returns 200 and new slot when reschedule succeeds", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    const oldSlot = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      status: "booked",
      pipeline_candidate_id: "pc1",
    };
    const newSlot = {
      id: "s2",
      job_id: "job-1",
      start_at: "2026-03-02T14:00:00Z",
      end_at: "2026-03-02T14:30:00Z",
      status: "available",
    };
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: (_key: string, id: string) => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: id === "s1" ? oldSlot : id === "s2" ? newSlot : null,
                    error: null,
                  }),
              }),
            }),
          }),
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      if (table === "pipeline_candidates")
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      return createMockQueryBuilder();
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const response = await POST(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slot_id).toBe("s2");
    expect(body.pipeline_candidate_id).toBe("pc1");
    expect(body.interview_scheduled_at).toBe("2026-03-02T14:00:00Z");
  });
});
