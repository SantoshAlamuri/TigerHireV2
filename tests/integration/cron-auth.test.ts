import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

vi.mock("@/lib/services/embeddings", () => ({
  embedAllCandidates: vi.fn().mockResolvedValue({ embedded: 0, errors: 0 }),
  embedAllJobs: vi.fn().mockResolvedValue({ embedded: 0, errors: 0 }),
}));

/** Cron auth calls checkRateLimit (Postgres); avoid requiring Supabase in CI/local without .env. */
vi.mock("@/lib/security/rate-limit", () => ({
  checkRateLimit: vi.fn().mockResolvedValue({
    allowed: true,
    remaining: 4,
    resetAt: new Date(Date.now() + 3_600_000),
  }),
}));

describe("cron route auth", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.CRON_SECRET = "test-secret-123";
    delete process.env.CRON_SECRET_HASH;
  });

  it("rejects requests without valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/embed/route");
    const request = new Request("http://localhost:3000/api/cron/embed", {
      method: "POST",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const response = await POST(request as any);
    expect(response.status).toBe(401);
  }, 15000);

  it("accepts requests with valid CRON_SECRET", async () => {
    const { POST } = await import("@/app/api/cron/embed/route");
    const request = new Request("http://localhost:3000/api/cron/embed", {
      method: "POST",
      headers: { authorization: "Bearer test-secret-123" },
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
  });

  it("accepts requests with valid CRON_SECRET_HASH (no raw secret in env)", async () => {
    const secret = "prod-cron-secret";
    const hash = createHash("sha256").update(secret).digest("hex");
    process.env.CRON_SECRET_HASH = hash;
    delete process.env.CRON_SECRET;
    vi.resetModules();
    const { POST } = await import("@/app/api/cron/embed/route");
    const request = new Request("http://localhost:3000/api/cron/embed", {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
    });
    const response = await POST(request as any);
    expect(response.status).toBe(200);
  });
});
