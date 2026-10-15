import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx } from "../helpers";
import {
  createInterviewBookMockAdmin,
  mockInterviewBookRpcMissingFunction,
  mockInterviewBookRpcSuccess,
  resetInterviewBookAdminRpc,
} from "../helpers/mock-interview-book-admin";

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
    new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }),
  handleZodError: (err: { issues: Array<{ message: string }> }) =>
    new Response(
      JSON.stringify({ error: err.issues.map((e: { message: string }) => e.message).join("; ") }),
      { status: 422, headers: { "Content-Type": "application/json" } },
    ),
  handleApiError: (err: unknown) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
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
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/services/resend", () => ({
  sendInterviewBooked: vi.fn().mockResolvedValue(undefined),
  sendEmail: vi.fn().mockResolvedValue({ skipped: true }),
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
const mockResolveCalendarConnection = vi.fn();
const mockResolveInfraConnection = vi.fn();
vi.mock("@/lib/settings/resolve-integration", () => ({
  resolveCalendarConnection: (...args: unknown[]) => mockResolveCalendarConnection(...args),
  resolveInfraConnection: (...args: unknown[]) => mockResolveInfraConnection(...args),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

const jobRecord = {
  id: "job-1",
  organisation_id: "org-1",
  hiring_manager_id: null,
};

describe("POST /api/jobs/[id]/interviews/book", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockResolveCalendarConnection.mockReset();
    mockResolveInfraConnection.mockReset();
    resetInterviewBookAdminRpc();
    mockInterviewBookRpcSuccess("2026-03-01T10:00:00Z", "2026-03-01T10:30:00Z");
    mockAssertJobAccess.mockResolvedValue({ job: jobRecord });
    mockResolveCalendarConnection.mockResolvedValue({
      provider: "google_calendar",
      status: "connected",
    });
    mockResolveInfraConnection.mockResolvedValue({
      provider: "daily",
      status: "connected",
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when slot_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("slot_id and pipeline_candidate_id are required");
  });

  it("returns 400 when pipeline_candidate_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when slot is not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "nonexistent", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Slot not found");
  });

  it("returns 409 when slot is already booked", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const bookedSlot = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "booked",
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: bookedSlot, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Slot is already booked");
  });

  it("returns 201 on successful booking", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const slotData = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "available",
    };
    const pcData = { id: "pc1", job_id: "job-1" };
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
              single: () =>
                Promise.resolve({ data: { candidate_id: "c1", candidates: null }, error: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { title: "Test Job" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.slot_id).toBe("s1");
    expect(body.pipeline_candidate_id).toBe("pc1");
    expect(body.interview_scheduled_at).toBe("2026-03-01T10:00:00Z");
  });

  it("returns 404 when pipeline candidate is not found for this job", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const slotData = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "available",
    };
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
        };
      }
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: null, error: { message: "not found" } }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc-wrong" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Pipeline candidate not found for this job");
  });

  it("returns 500 when slot update fails", async () => {
    mockInterviewBookRpcMissingFunction();
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const slotData = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "available",
    };
    const pcData = { id: "pc1", job_id: "job-1" };
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
            eq: () => ({ eq: () => Promise.resolve({ error: { message: "update failed" } }) }),
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
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to book slot");
  });

  it("returns 404 when job is not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Job not found");
  });

  it("returns 201 for leadership role", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    const slotData = {
      id: "s1",
      job_id: "job-1",
      start_at: "2026-03-01T10:00:00Z",
      end_at: "2026-03-01T10:30:00Z",
      status: "available",
    };
    const pcData = { id: "pc1", job_id: "job-1" };
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
              single: () =>
                Promise.resolve({ data: { candidate_id: "c1", candidates: null }, error: null }),
            }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { title: "Test Job" }, error: null }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/book/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", pipeline_candidate_id: "pc1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(201);
  });
});
