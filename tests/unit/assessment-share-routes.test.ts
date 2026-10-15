import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createMockQueryBuilder, createMockSupabase } from "../helpers";

const mockCreateSupabaseAdmin = vi.fn();
const mockSubmitAssessmentByToken = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/api-helpers", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
    jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
    handleZodError: () => Response.json({ error: "Invalid request payload" }, { status: 422 }),
    handleApiError: (err: unknown) => Response.json({ error: String(err) }, { status: 500 }),
  };
});

vi.mock("@/lib/services/assessment-share", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    submitAssessmentByToken: (...args: unknown[]) => mockSubmitAssessmentByToken(...args),
  };
});

describe("assessment share routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/assessments/share/[token] returns 404 when token is missing", async () => {
    const admin = createMockSupabase({
      assessments: createMockQueryBuilder({ data: null, error: null }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { GET } = await import("@/app/api/assessments/share/[token]/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments/share/bad"), {
      params: Promise.resolve({ token: "bad" }),
    });
    expect(res.status).toBe(404);
  });

  it("GET /api/assessments/share/[token] returns 410 when pending assessment is expired", async () => {
    const admin = createMockSupabase({
      assessments: createMockQueryBuilder({
        data: {
          id: "asmt-1",
          title: "Round 1",
          instructions: "Solve",
          type: "written",
          status: "pending",
          deadline_at: "2000-01-01T00:00:00.000Z",
          submission_url: null,
          submission_text: null,
        },
      }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { GET } = await import("@/app/api/assessments/share/[token]/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments/share/tok"), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(410);
  });

  it("GET /api/assessments/share/[token] returns assessment for valid token", async () => {
    const admin = createMockSupabase({
      assessments: createMockQueryBuilder({
        data: {
          id: "asmt-1",
          title: "Round 1",
          instructions: "Solve",
          type: "written",
          status: "pending",
          deadline_at: "2099-01-01T00:00:00.000Z",
          submission_url: null,
          submission_text: null,
        },
      }),
    });
    mockCreateSupabaseAdmin.mockReturnValue(admin);

    const { GET } = await import("@/app/api/assessments/share/[token]/route");
    const res = await GET(new NextRequest("http://localhost/api/assessments/share/tok"), {
      params: Promise.resolve({ token: "tok" }),
    });
    expect(res.status).toBe(200);
  });

  it("POST /api/assessments/share/[token]/submit maps service errors and success", async () => {
    const { POST } = await import("@/app/api/assessments/share/[token]/submit/route");

    mockSubmitAssessmentByToken.mockResolvedValueOnce({
      ok: false,
      status: 410,
      error: "Assessment deadline has passed",
    });
    const expiredRes = await POST(
      new NextRequest("http://localhost/api/assessments/share/tok/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionText: "hello" }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(expiredRes.status).toBe(410);

    mockSubmitAssessmentByToken.mockResolvedValueOnce({
      ok: true,
      assessmentId: "asmt-1",
    });
    const okRes = await POST(
      new NextRequest("http://localhost/api/assessments/share/tok/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionText: "hello" }),
      }),
      { params: Promise.resolve({ token: "tok" }) },
    );
    expect(okRes.status).toBe(200);
    const body = await okRes.json();
    expect(body.assessmentId).toBe("asmt-1");
  });
});
