import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabase, createMockQueryBuilder } from "../helpers";
const admin = vi.hoisted(() => vi.fn());
const erase = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdmin: admin }));
vi.mock("@/lib/security/cron-auth", () => ({ validateCronSecret: async () => true }));
vi.mock("@/lib/services/CandidateService", () => ({ CandidateService: { eraseData: erase } }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
import { POST } from "@/app/api/cron/privacy-retention/route";

beforeEach(() => vi.clearAllMocks());
describe("erasure retries", () => {
  it("persists phone-only identity before erasing and does not mark failed erasure completed", async () => {
    const requests = createMockQueryBuilder({
      data: [{ id: "r1", phone: "123", candidate_id: null }],
    });
    const candidates = createMockQueryBuilder({ data: { id: "c1" } });
    admin.mockReturnValue(createMockSupabase({ erasure_requests: requests, candidates }));
    erase.mockImplementation(async () => {
      expect(requests.update).toHaveBeenCalledWith({ candidate_id: "c1" });
      throw new Error("partial erasure");
    });
    const body = await (await POST(new Request("http://localhost"))).json();
    expect(body).toMatchObject({ ok: false, processed: 0, failed: 1 });
    expect(requests.update).toHaveBeenCalledTimes(1);
  });

  it("does not erase when the retry identity cannot be persisted", async () => {
    const requests = createMockQueryBuilder({ data: [{ id: "r1", candidate_id: "c1" }] });
    requests.update = vi
      .fn()
      .mockReturnValue(createMockQueryBuilder({ error: { message: "denied" } }));
    admin.mockReturnValue(createMockSupabase({ erasure_requests: requests }));
    const body = await (await POST(new Request("http://localhost"))).json();
    expect(body.failed).toBe(1);
    expect(erase).not.toHaveBeenCalled();
  });

  it("does not count a failed completion stamp as processed", async () => {
    const requests = createMockQueryBuilder({ data: [{ id: "r1", candidate_id: "c1" }] });
    requests.update = vi
      .fn()
      .mockReturnValueOnce(createMockQueryBuilder())
      .mockReturnValueOnce(createMockQueryBuilder({ error: { message: "denied" } }));
    admin.mockReturnValue(createMockSupabase({ erasure_requests: requests }));
    erase.mockResolvedValue(undefined);
    const body = await (await POST(new Request("http://localhost"))).json();
    expect(body).toMatchObject({ ok: false, processed: 0, failed: 1 });
  });
});
