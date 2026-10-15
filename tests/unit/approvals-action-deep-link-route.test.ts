import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const VALID_TOKEN = "a".repeat(32);

const mockRunApprovalDeepLinkDecision = vi.hoisted(() =>
  vi.fn(
    async (
      _admin: unknown,
      _request: NextRequest,
      consumed: { id: string; action: string },
      _params: { logRoute: string },
    ) =>
      new NextResponse(`decision:${consumed.id}:${consumed.action}`, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
  ),
);

vi.mock("@/lib/approvals/run-approval-deep-link-decision", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/approvals/run-approval-deep-link-decision")>();
  return {
    ...actual,
    runApprovalDeepLinkDecision: mockRunApprovalDeepLinkDecision,
  };
});

const mockCreateSupabaseAdmin = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => mockCreateSupabaseAdmin(),
}));

vi.mock("@/lib/config/env", () => ({
  env: { baseUrl: "https://app.example.com" },
}));

const mockValidateOrigin = vi.hoisted(() => vi.fn(() => null as NextResponse | null));
vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: (...args: unknown[]) => mockValidateOrigin(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

// The route calls getAuthContext() (→ createSupabaseServerClient, which needs env vars).
// Default to an unauthenticated request so the token single-use+expiry guard runs; the
// route imports nothing else from api-helpers, so a full-module mock is safe here.
const mockGetAuthContext = vi.hoisted(() => vi.fn(async () => null));
vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...(args as [])),
}));

function approvalTokensReadBuilder(
  tokenRow: Record<string, unknown> | null,
  readError: Error | null,
) {
  const updateSpy = vi.fn(() => {
    throw new Error("approval_tokens.update must not run on GET");
  });
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    update: updateSpy,
    maybeSingle: vi.fn().mockResolvedValue({ data: tokenRow, error: readError }),
  };
  return { builder, updateSpy };
}

function approvalTokensConsumeBuilder(
  consumed: Record<string, unknown> | null,
  consumeError: Error | null,
) {
  const inner = {
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: consumed, error: consumeError }),
  };
  return {
    update: vi.fn(() => inner),
  };
}

describe("GET /api/approvals/action/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
    mockRunApprovalDeepLinkDecision.mockClear();
  });

  it("returns 404 when token is too short", async () => {
    const { GET } = await import("@/app/api/approvals/action/[token]/route");
    const res = await GET(new NextRequest("https://app.example.com/api/approvals/action/short"), {
      params: Promise.resolve({ token: "short" }),
    });
    expect(res.status).toBe(404);
    expect(mockCreateSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("does not consume token: only select on approval_tokens, then loads offer summary", async () => {
    const tokenRow = {
      id: "tok-row-1",
      action: "approve",
      offer_id: "offer-1",
      hiring_request_id: null,
      approver_profile_id: "prof-1",
      approval_type: "finance",
    };
    const { builder: atBuilder, updateSpy } = approvalTokensReadBuilder(tokenRow, null);
    const offersBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { role_title: "Staff Engineer" },
        error: null,
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "approval_tokens") return atBuilder;
        if (table === "offers") return offersBuilder;
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/approvals/action/[token]/route");
    const res = await GET(
      new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`),
      {
        params: Promise.resolve({ token: VALID_TOKEN }),
      },
    );

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("This action is not recorded yet");
    expect(html).toContain("Staff Engineer");
    expect(html).toContain(`action="https://app.example.com/api/approvals/action/${VALID_TOKEN}"`);
    expect(html).toContain('method="post"');
    expect(updateSpy).not.toHaveBeenCalled();
    expect(mockRunApprovalDeepLinkDecision).not.toHaveBeenCalled();
  });

  it("loads hiring request title when token is for a requisition", async () => {
    const tokenRow = {
      id: "tok-hr-1",
      action: "reject",
      offer_id: null,
      hiring_request_id: "hr-1",
      approver_profile_id: "prof-1",
      approval_type: "finance",
    };
    const { builder: atBuilder, updateSpy } = approvalTokensReadBuilder(tokenRow, null);
    const hrBuilder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { title: "Backend hire Q2" },
        error: null,
      }),
    };
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "approval_tokens") return atBuilder;
        if (table === "hiring_requests") return hrBuilder;
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const { GET } = await import("@/app/api/approvals/action/[token]/route");
    const res = await GET(
      new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`),
      {
        params: Promise.resolve({ token: VALID_TOKEN }),
      },
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Backend hire Q2");
    expect(html).toContain("/company/hiring-requests");
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("returns 410 when token row is missing (expired or used)", async () => {
    const { builder: atBuilder } = approvalTokensReadBuilder(null, null);
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => atBuilder),
    });
    const { GET } = await import("@/app/api/approvals/action/[token]/route");
    const res = await GET(
      new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`),
      {
        params: Promise.resolve({ token: VALID_TOKEN }),
      },
    );
    expect(res.status).toBe(410);
  });
});

describe("POST /api/approvals/action/[token]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateOrigin.mockReturnValue(null);
    mockRunApprovalDeepLinkDecision.mockClear();
  });

  it("returns 403 HTML when validateOrigin blocks the request", async () => {
    mockValidateOrigin.mockReturnValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
    const { POST } = await import("@/app/api/approvals/action/[token]/route");
    const res = await POST(
      new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`),
      {
        params: Promise.resolve({ token: VALID_TOKEN }),
      },
    );
    expect(res.status).toBe(403);
    const text = await res.text();
    expect(text).toContain("Could not confirm");
    expect(mockCreateSupabaseAdmin).not.toHaveBeenCalled();
    expect(mockRunApprovalDeepLinkDecision).not.toHaveBeenCalled();
  });

  it("consumes token then delegates to runApprovalDeepLinkDecision", async () => {
    const consumed = {
      id: "tok-consumed-1",
      action: "approve",
      offer_id: "offer-1",
      hiring_request_id: null,
      approver_profile_id: "prof-1",
      approval_type: "finance",
    };
    const atBuilder = approvalTokensConsumeBuilder(consumed, null);
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "approval_tokens") return atBuilder;
        throw new Error(`unexpected table ${table}`);
      }),
    });

    const { POST } = await import("@/app/api/approvals/action/[token]/route");
    const req = new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`, {
      method: "POST",
      headers: { Origin: "https://app.example.com" },
    });
    const res = await POST(req, { params: Promise.resolve({ token: VALID_TOKEN }) });

    expect(atBuilder.update).toHaveBeenCalled();
    expect(mockRunApprovalDeepLinkDecision).toHaveBeenCalledTimes(1);
    const call = mockRunApprovalDeepLinkDecision.mock.calls[0];
    expect(call?.[2]).toMatchObject({ id: "tok-consumed-1", action: "approve" });
    expect(call?.[3]).toEqual({ logRoute: "POST /api/approvals/action/[token]" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("decision:tok-consumed-1:approve");
  });

  it("returns 410 when consume yields no row", async () => {
    const atBuilder = approvalTokensConsumeBuilder(null, null);
    mockCreateSupabaseAdmin.mockReturnValue({
      from: vi.fn(() => atBuilder),
    });
    const { POST } = await import("@/app/api/approvals/action/[token]/route");
    const res = await POST(
      new NextRequest(`https://app.example.com/api/approvals/action/${VALID_TOKEN}`, {
        method: "POST",
        headers: { Origin: "https://app.example.com" },
      }),
      { params: Promise.resolve({ token: VALID_TOKEN }) },
    );
    expect(res.status).toBe(410);
    expect(mockRunApprovalDeepLinkDecision).not.toHaveBeenCalled();
  });
});
