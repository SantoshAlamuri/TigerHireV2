import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { recruiterCtx, candidateCtx, buildRequest } from "../helpers";

const mockFetchQuestions = vi.fn();
const mockToPublic = vi.fn((rows: unknown) => rows);

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: vi.fn(),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role: string } | null, ...roles: string[]) =>
    Boolean(ctx && roles.includes(ctx.role)),
  jsonError: (msg: string, status: number) => Response.json({ error: msg }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, msg: string) => Response.json({ error: msg }, { status: 500 }),
}));

vi.mock("@/lib/screening/job-screening", () => ({
  fetchActiveScreeningQuestions: (...args: unknown[]) => mockFetchQuestions(...args),
  toPublicQuestions: (rows: unknown) => mockToPublic(rows),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/api-helpers";

const mockCreate = createSupabaseServerClient as unknown as ReturnType<typeof vi.fn>;
const mockGetAuth = getAuthContext as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/jobs/[id]/public-screening-questions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for non-candidate", async () => {
    mockGetAuth.mockResolvedValue(recruiterCtx);
    const { GET } = await import("@/app/api/jobs/[id]/public-screening-questions/route");
    const req = new NextRequest("http://localhost/jobs/j1/qs");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when job is not open", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const supabase = {
      from: () => ({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: { id: "j1", status: "closed" },
                error: null,
              }),
          }),
        }),
      }),
    };
    mockCreate.mockResolvedValue(supabase);

    const { GET } = await import("@/app/api/jobs/[id]/public-screening-questions/route");
    const req = new NextRequest("http://localhost/jobs/j1/qs");
    const res = await GET(req, { params: Promise.resolve({ id: "j1" }) });
    expect(res.status).toBe(404);
  });

  it("returns 200 with public questions for open job", async () => {
    mockGetAuth.mockResolvedValue(candidateCtx);
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: () =>
        Promise.resolve({
          data: { id: "j-open", status: "open" },
          error: null,
        }),
    };
    const supabase = { from: () => chain };
    mockCreate.mockResolvedValue(supabase);
    mockFetchQuestions.mockResolvedValue([{ id: "q1", text: "Ok?", order_index: 0, active: true }]);
    mockToPublic.mockReturnValue([{ id: "q1", text: "Ok?" }]);

    const { GET } = await import("@/app/api/jobs/[id]/public-screening-questions/route");
    const req = buildRequest("http://localhost/jobs/j1/qs");
    const res = await GET(req as never, { params: Promise.resolve({ id: "j-open" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.questions).toBeDefined();
    expect(mockFetchQuestions).toHaveBeenCalled();
  });
});
