import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, companyAdminCtx, hiringManagerCtx } from "../helpers";

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
  handleApiError: (err: unknown, _msg: string) =>
    new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/services/resend", () => ({
  sendInterviewCancelled: vi.fn().mockResolvedValue(undefined),
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

describe("POST /api/jobs/[id]/interviews/cancel", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockAssertJobAccess.mockResolvedValue({ job: jobRecord });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when slot_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("slot_id is required");
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "nonexistent" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Slot not found");
  });

  it("returns 409 when slot is not booked", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const availableSlot = {
      id: "s1",
      job_id: "job-1",
      status: "available",
      pipeline_candidate_id: null,
    };
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: availableSlot, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Slot is not booked");
  });

  it("returns 200 on successful cancellation", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const bookedSlot = {
      id: "s1",
      job_id: "job-1",
      status: "booked",
      pipeline_candidate_id: "pc1",
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
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
    expect(body.slot_id).toBe("s1");
  });

  it("returns 500 when slot update fails", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const bookedSlot = {
      id: "s1",
      job_id: "job-1",
      status: "booked",
      pipeline_candidate_id: "pc1",
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
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: { message: "update failed" } }) }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to cancel slot");
  });

  it("returns 404 when job is not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-missing/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Job not found");
  });

  it("returns 200 for hiring_manager role", async () => {
    mockGetAuthContext.mockResolvedValue(hiringManagerCtx);
    const bookedSlot = {
      id: "s1",
      job_id: "job-1",
      status: "booked",
      pipeline_candidate_id: "pc1",
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
          update: () => ({
            eq: () => ({ eq: () => Promise.resolve({ error: null }) }),
          }),
        };
      }
      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/cancel/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cancelled).toBe(true);
  });
});
