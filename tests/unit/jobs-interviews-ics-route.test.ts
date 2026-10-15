import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { candidateCtx, recruiterCtx } from "../helpers";

const mockGetAuthContext = vi.fn();
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: () => mockGetAuthContext(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string }, ...roles: string[]) => roles.includes(ctx.role),
  jsonError: (msg: string, status: number) =>
    new Response(JSON.stringify({ error: msg }), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ auth: { getUser: vi.fn() }, from: mockFrom }),
}));

const mockAssertJobAccess = vi.fn();
vi.mock("@/lib/job-access", () => ({
  assertJobAccess: (...args: unknown[]) => mockAssertJobAccess(...args),
}));

describe("GET /api/jobs/[id]/interviews/ics", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetAuthContext.mockReset();
    mockFrom.mockReset();
    mockAssertJobAccess.mockReset();
    mockAssertJobAccess.mockResolvedValue({
      job: { id: "job-1", organisation_id: "org-1", hiring_manager_id: null },
    });
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);

    const { GET } = await import("@/app/api/jobs/[id]/interviews/ics/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/interviews/ics?slot_id=slot-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });

    expect(res.status).toBe(401);
  });

  it("returns 403 for candidate role", async () => {
    mockGetAuthContext.mockResolvedValue(candidateCtx);

    const { GET } = await import("@/app/api/jobs/[id]/interviews/ics/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/interviews/ics?slot_id=slot-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });

    expect(res.status).toBe(403);
  });

  it("returns 400 when slot_id is missing", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    const { GET } = await import("@/app/api/jobs/[id]/interviews/ics/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/interviews/ics");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("slot_id is required");
  });

  it("returns 200 with ICS content", async () => {
    mockGetAuthContext.mockResolvedValue(recruiterCtx);

    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: {
                      id: "slot-1",
                      job_id: "job-1",
                      start_at: "2026-05-21T09:00:00.000Z",
                      end_at: "2026-05-21T09:30:00.000Z",
                      status: "booked",
                      pipeline_candidate_id: "pc-1",
                    },
                    error: null,
                  }),
              }),
            }),
          }),
        };
      }

      if (table === "jobs") {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: { title: "Staff Engineer" }, error: null }),
            }),
          }),
        };
      }

      if (table === "pipeline_candidates") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { candidates: { name: "Jane Doe" } },
                  error: null,
                }),
            }),
          }),
        };
      }

      return {};
    });

    const { GET } = await import("@/app/api/jobs/[id]/interviews/ics/route");
    const req = new NextRequest("http://localhost/api/jobs/job-1/interviews/ics?slot_id=slot-1");
    const res = await GET(req, { params: Promise.resolve({ id: "job-1" }) });
    const body = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/calendar");
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("SUMMARY:Interview - Staff Engineer");
    expect(body).toContain("DESCRIPTION:Interview for role: Staff Engineer. Candidate: Jane Doe.");
  });
});
