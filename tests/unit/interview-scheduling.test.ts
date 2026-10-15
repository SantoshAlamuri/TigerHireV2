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

vi.mock("@/lib/settings/resolve-integration", () => ({
  resolveCalendarConnection: vi.fn().mockResolvedValue({ id: "cal-1" }),
  resolveInfraConnection: vi.fn().mockResolvedValue({ id: "infra-1" }),
}));

vi.mock("@/lib/services/resend", () => ({
  sendInterviewBooked: vi.fn().mockResolvedValue(undefined),
  sendInterviewCancelled: vi.fn().mockResolvedValue(undefined),
  sendInterviewRescheduled: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/whatsapp", () => ({
  sendInterviewRescheduledTemplate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/interviews/run-booked-delivery", () => ({
  runBookedInterviewDelivery: vi.fn().mockResolvedValue({
    delivery: {
      candidate_email_status: null,
      interviewer_email_status: null,
      candidate_whatsapp_status: null,
      last_delivery_attempt_at: null,
    },
    has_delivery_failure: false,
  }),
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

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

describe("GET /api/jobs/[id]/availability", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("GET availability returns slots", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as any);
    const jobData = {
      id: "job-1",
      organisation_id: "org-1",
      hiring_manager_id: null,
    };
    const slotsData = [
      {
        id: "s1",
        start_at: "2026-03-01T10:00:00Z",
        end_at: "2026-03-01T10:30:00Z",
        timezone: "Asia/Kolkata",
        status: "available",
      },
      {
        id: "s2",
        start_at: "2026-03-01T11:00:00Z",
        end_at: "2026-03-01T11:30:00Z",
        timezone: "Asia/Kolkata",
        status: "available",
      },
    ];
    mockAssertJobAccess.mockResolvedValueOnce({ job: jobData });
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({
                lte: () => ({
                  order: () => Promise.resolve({ data: slotsData, error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return createMockQueryBuilder();
    });
    const { GET } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest(
      "http://localhost/api/jobs/job-1/availability?from=2026-03-01&to=2026-03-02",
    );
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.slots).toHaveLength(2);
    expect(body.slots[0].id).toBe("s1");
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { GET } = await import("@/app/api/jobs/[id]/availability/route");
    const request = new NextRequest("http://localhost/api/jobs/job-1/availability");
    const response = await GET(request, {
      params: Promise.resolve({ id: "job-1" }),
    });
    expect(response.status).toBe(401);
  });
});

describe("POST /api/jobs/[id]/interviews/book", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    resetInterviewBookAdminRpc();
    mockInterviewBookRpcSuccess("2026-03-01T10:00:00Z", "2026-03-01T10:30:00Z");
  });

  it("POST book creates booking", async () => {
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
});

describe("POST /api/jobs/[id]/interviews/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("POST cancel cancels a booking", async () => {
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
      if (table === "pipeline_candidates") {
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
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
});

describe("POST /api/jobs/[id]/interviews/reschedule", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
  });

  it("reschedule updates slot times", async () => {
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
        let callCount = 0;
        return {
          select: () => ({
            eq: (_key: string, id: string) => ({
              eq: () => ({
                single: () => {
                  callCount++;
                  if (id === "s1") {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  if (id === "s2") {
                    return Promise.resolve({ data: newSlot, error: null });
                  }
                  return Promise.resolve({ data: null, error: null });
                },
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
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
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
});
