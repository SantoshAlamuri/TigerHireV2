import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGetAuthContext = vi.fn();
const mockRecordManualPlatformCost = vi.fn();

vi.mock("@/lib/api-helpers", () => ({
  getAuthContext: (...args: unknown[]) => mockGetAuthContext(...args),
  requireAuth: (ctx: unknown) => ctx !== null,
  hasRole: (ctx: { role?: string }, role: string) => ctx?.role === role,
  jsonError: (error: string, status: number) => Response.json({ error }, { status }),
  jsonSuccess: (data: unknown, status = 200) => Response.json(data, { status }),
  handleApiError: (_err: unknown, message: string) =>
    Response.json({ error: message }, { status: 500 }),
  handleZodError: (err: { issues: { message: string }[] }) =>
    Response.json({ error: err.issues.map((i) => i.message).join("; ") }, { status: 422 }),
}));

vi.mock("@/lib/security/csrf", () => ({
  validateOrigin: () => null,
}));

vi.mock("@/lib/costs/ledger", () => ({
  recordManualPlatformCost: (...args: unknown[]) => mockRecordManualPlatformCost(...args),
}));

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost:3000/api/admin/costs/manual", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/admin/costs/manual", () => {
  beforeEach(() => {
    mockGetAuthContext.mockReset();
    mockRecordManualPlatformCost.mockReset();
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const res = await POST(makeRequest({ provider: "meta", amountUsd: 10, periodKey: "2026-05" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-super-admin", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "recruiter" });
    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const res = await POST(makeRequest({ provider: "meta", amountUsd: 10, periodKey: "2026-05" }));
    expect(res.status).toBe(403);
  });

  it("rejects invalid provider via zod", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const res = await POST(
      makeRequest({ provider: "openai", amountUsd: 10, periodKey: "2026-05" }),
    );
    expect(res.status).toBe(422);
    expect(mockRecordManualPlatformCost).not.toHaveBeenCalled();
  });

  it("rejects negative amount", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const res = await POST(makeRequest({ provider: "meta", amountUsd: -1, periodKey: "2026-05" }));
    expect(res.status).toBe(422);
    expect(mockRecordManualPlatformCost).not.toHaveBeenCalled();
  });

  it("records the manual cost and returns externalId for super_admin", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "user-42", role: "super_admin" });
    mockRecordManualPlatformCost.mockResolvedValue({ externalId: "manual:meta:2026-05" });

    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const res = await POST(
      makeRequest({
        provider: "meta",
        amountUsd: 142.5,
        periodKey: "2026-05",
        notes: "Meta WABA invoice",
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { saved: boolean; externalId: string };
    expect(json.saved).toBe(true);
    expect(json.externalId).toBe("manual:meta:2026-05");
    expect(mockRecordManualPlatformCost).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "meta",
        amountUsd: 142.5,
        periodKey: "2026-05",
        notes: "Meta WABA invoice",
        enteredByUserId: "user-42",
      }),
    );
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetAuthContext.mockResolvedValue({ userId: "u1", role: "super_admin" });
    const { POST } = await import("@/app/api/admin/costs/manual/route");
    const req = new NextRequest("http://localhost:3000/api/admin/costs/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
