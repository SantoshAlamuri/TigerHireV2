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
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));
vi.mock("@/lib/services/resend", () => ({
  sendInterviewRescheduled: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/services/whatsapp", () => ({
  sendInterviewRescheduledTemplate: vi.fn().mockResolvedValue(undefined),
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

describe("POST /api/jobs/[id]/interviews/reschedule", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockResolveCalendarConnection.mockReset();
    mockResolveInfraConnection.mockReset();
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns 400 when slot_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("slot_id and new_slot_id are required");
  });

  it("returns 400 when new_slot_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("slot_id and new_slot_id are required");
  });

  it("returns 400 when slot_id equals new_slot_id", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s1" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("new_slot_id must be different from slot_id");
  });

  it("returns 404 when current slot is not found", async () => {
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "nonexistent", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Current slot not found");
  });

  it("returns 409 when current slot is not booked", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const availableSlot = { ...oldSlot, status: "available", pipeline_candidate_id: null };
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Current slot is not booked");
  });

  it("returns 404 when new slot is not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => {
                  callCount++;
                  if (callCount === 1) {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  return Promise.resolve({ data: null, error: { message: "not found" } });
                },
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s-missing" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("New slot not found");
  });

  it("returns 409 when new slot is not available (already taken)", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    const bookedNewSlot = { ...newSlot, status: "booked" };
    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => {
                  callCount++;
                  if (callCount === 1) {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  return Promise.resolve({ data: bookedNewSlot, error: null });
                },
              }),
            }),
          }),
        };
      }
      return {};
    });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("New slot is not available");
  });

  it("returns 200 on successful reschedule", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    let selectCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => {
                  selectCallCount++;
                  if (selectCallCount === 1) {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  return Promise.resolve({ data: newSlot, error: null });
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slot_id).toBe("s2");
    expect(body.pipeline_candidate_id).toBe("pc1");
    expect(body.interview_scheduled_at).toBe("2026-03-02T14:00:00Z");
  });

  it("returns 500 when freeing old slot fails", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    let selectCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => {
                  selectCallCount++;
                  if (selectCallCount === 1) {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  return Promise.resolve({ data: newSlot, error: null });
                },
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Failed to reschedule");
  });

  it("returns 404 when job is not found", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);
    mockAssertJobAccess.mockResolvedValue({ job: null });
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest(
      "http://localhost:3000/api/jobs/job-missing/interviews/reschedule",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "job-missing" }) });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Job not found");
  });

  it("returns 200 for leadership role", async () => {
    mockGetAuthContext.mockResolvedValue(companyAdminCtx);
    let selectCallCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () => {
                  selectCallCount++;
                  if (selectCallCount === 1) {
                    return Promise.resolve({ data: oldSlot, error: null });
                  }
                  return Promise.resolve({ data: newSlot, error: null });
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
    const { POST } = await import("@/app/api/jobs/[id]/interviews/reschedule/route");
    const req = new NextRequest("http://localhost:3000/api/jobs/job-1/interviews/reschedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot_id: "s1", new_slot_id: "s2" }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "job-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slot_id).toBe("s2");
    expect(body.pipeline_candidate_id).toBe("pc1");
  });
});
