import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder } from "../helpers";

const mockValidateCronSecret = vi.fn();
const mockOnInterviewTransition = vi.fn();

vi.mock("@/lib/security/cron-auth", () => ({
  validateCronSecret: (...args: unknown[]) => mockValidateCronSecret(...args),
}));

vi.mock("@/lib/interviews/notifier", () => ({
  onInterviewTransition: (...args: unknown[]) => mockOnInterviewTransition(...args),
}));

const selectBuilder = createMockQueryBuilder();
const updateBuilder = createMockQueryBuilder();
const mockSupabaseAdmin = {
  from: vi.fn((table: string) => {
    if (table === "interview_availability_slots") return selectBuilder;
    return updateBuilder;
  }),
};

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockSupabaseAdmin,
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

describe("GET /api/cron/interview-reminders", () => {
  beforeEach(() => {
    mockValidateCronSecret.mockReset();
    mockOnInterviewTransition.mockReset();
    selectBuilder.select.mockClear();
    selectBuilder.eq.mockClear();
    selectBuilder.is.mockClear();
    selectBuilder.gte.mockClear();
    selectBuilder.lte.mockClear();
    selectBuilder.then.mockClear();
    updateBuilder.update.mockClear();
    updateBuilder.eq.mockClear();
    updateBuilder.then.mockClear();
    mockSupabaseAdmin.from.mockClear();
    vi.clearAllMocks();
  });

  it("returns 401 when cron secret is invalid", async () => {
    mockValidateCronSecret.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cron/interview-reminders/route");
    const req = new NextRequest("http://localhost:3000/api/cron/interview-reminders");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 200 with no upcoming interviews", async () => {
    mockValidateCronSecret.mockResolvedValue(true);
    selectBuilder.lte.mockResolvedValue({
      data: [],
      error: null,
    });

    const { GET } = await import("@/app/api/cron/interview-reminders/route");
    const req = new NextRequest("http://localhost:3000/api/cron/interview-reminders");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBe(0);
    expect(body.message).toBe("No upcoming interviews");
  });

  it("sends reminders for upcoming interviews", async () => {
    mockValidateCronSecret.mockResolvedValue(true);
    mockOnInterviewTransition.mockResolvedValue(undefined);

    const now = new Date();
    const in24Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000); // 12 hours from now

    selectBuilder.lte.mockResolvedValue({
      data: [
        {
          id: "slot-1",
          start_at: in24Hours.toISOString(),
          user_id: null,
          pipeline_candidate_id: "pc-1",
          pipeline_candidates: {
            id: "pc-1",
            job_id: "job-1",
            candidate_id: "candidate-1",
            candidates: {
              name: "John Doe",
              email: "john@example.com",
            },
          },
          jobs: {
            title: "Software Engineer",
          },
        },
      ],
      error: null,
    });

    updateBuilder.eq.mockResolvedValue({
      data: null,
      error: null,
    });

    const { GET } = await import("@/app/api/cron/interview-reminders/route");
    const req = new NextRequest("http://localhost:3000/api/cron/interview-reminders");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent).toBeGreaterThan(0);
    expect(mockOnInterviewTransition).toHaveBeenCalled();
  });
});
