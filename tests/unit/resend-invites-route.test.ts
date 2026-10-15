import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

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
  assertJobAccess: vi.fn(async () => ({
    job: { id: "job-1", organisation_id: "org-1" },
  })),
}));

const mockRunBooked = vi.fn();
vi.mock("@/lib/interviews/run-booked-delivery", () => ({
  runBookedInterviewDelivery: (...args: unknown[]) => mockRunBooked(...args),
}));

const mockBuildCtx = vi.fn();
vi.mock("@/lib/interviews/build-booked-invite-context", () => ({
  buildBookedInviteContext: (...args: unknown[]) => mockBuildCtx(...args),
}));

const mockFrom = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => Promise.resolve({ from: mockFrom }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({ from: vi.fn() }),
}));

describe("POST /api/interview-slots/[id]/resend-invites", () => {
  beforeEach(() => {
    vi.resetModules();
    mockFrom.mockReset();
    mockRunBooked.mockReset();
    mockBuildCtx.mockReset();
  });

  it("returns 401 when not authenticated", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(null);
    const { POST } = await import("@/app/api/interview-slots/[id]/resend-invites/route");
    const res = await POST(
      new NextRequest("http://localhost/api/interview-slots/s1/resend-invites", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when slot is not booked", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as never);
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "s1",
                    job_id: "job-1",
                    status: "available",
                    pipeline_candidate_id: null,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return createMockQueryBuilder();
    });
    const { POST } = await import("@/app/api/interview-slots/[id]/resend-invites/route");
    const res = await POST(
      new NextRequest("http://localhost/api/interview-slots/s1/resend-invites", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("resends failed channels and returns delivery payload", async () => {
    const { getAuthContext } = await import("@/lib/api-helpers");
    vi.mocked(getAuthContext).mockResolvedValueOnce(recruiterCtx as never);
    mockFrom.mockImplementation((table: string) => {
      if (table === "interview_availability_slots") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: "s1",
                    job_id: "job-1",
                    user_id: "u2",
                    start_at: "2026-03-01T10:00:00Z",
                    end_at: "2026-03-01T10:30:00Z",
                    status: "booked",
                    pipeline_candidate_id: "pc1",
                    candidate_email_status: "failed",
                    interviewer_email_status: "sent",
                    candidate_whatsapp_status: "not_applicable",
                    last_delivery_attempt_at: "2026-05-17T10:00:00Z",
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      return createMockQueryBuilder();
    });
    mockBuildCtx.mockResolvedValue({
      jobId: "job-1",
      slotId: "s1",
      slotStartAt: "2026-03-01T10:00:00Z",
      slotEndAt: "2026-03-01T10:30:00Z",
    });
    mockRunBooked.mockResolvedValue({
      delivery: {
        candidate_email_status: "resent",
        interviewer_email_status: "sent",
        candidate_whatsapp_status: "not_applicable",
        last_delivery_attempt_at: "2026-05-17T11:00:00Z",
      },
      has_delivery_failure: false,
      failed_channels: [],
      channel_results: {},
    });

    const { POST } = await import("@/app/api/interview-slots/[id]/resend-invites/route");
    const res = await POST(
      new NextRequest("http://localhost/api/interview-slots/s1/resend-invites", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.slot_id).toBe("s1");
    expect(body.has_delivery_failure).toBe(false);
    expect(mockRunBooked).toHaveBeenCalledWith(
      expect.objectContaining({
        channelsToRetry: ["candidate_email"],
      }),
    );
  });
});
