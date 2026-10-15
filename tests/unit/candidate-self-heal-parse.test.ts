// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueSpy = vi.fn();
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: (...a: unknown[]) => enqueueSpy(...a),
}));

const warn = vi.fn();
vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: (...a: unknown[]) => warn(...a), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => {
    throw new Error("test must inject admin");
  },
}));

import {
  STALE_PROCESSING_MS,
  maybeSelfHealCandidateParse,
  selfHealEligibility,
} from "@/lib/candidates/self-heal-parse";

const NOW = Date.parse("2026-09-17T04:30:00Z");
const HOURS_AGO = new Date(NOW - 12 * 3600_000).toISOString();

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "56692e3c-c092-4d42-9883-957368665932",
    resume_url: "https://x.supabase.co/storage/v1/object/sign/candidate-cvs/cvs/a.pdf?token=t",
    cv_url: null,
    cv_parsed_at: null,
    processing_status: "pending",
    created_at: HOURS_AGO,
    updated_at: HOURS_AGO,
    ...overrides,
  };
}

describe("selfHealEligibility", () => {
  it("re-reads a pending row with a stored CV that was never parsed", () => {
    expect(selfHealEligibility(row(), NOW)).toEqual({
      eligible: true,
      reason: "pending_unparsed",
    });
  });

  it.each([
    [{ resume_url: null, cv_url: null }, "no_cv"],
    [{ cv_parsed_at: HOURS_AGO }, "already_parsed"],
    [{ processing_status: "failed" }, "status_failed"],
    [{ processing_status: "complete" }, "status_complete"],
    [{ created_at: new Date(NOW - 30_000).toISOString() }, "too_young"],
    [
      { processing_status: "processing", updated_at: new Date(NOW - 60_000).toISOString() },
      "in_flight",
    ],
  ])("does not re-read %j (%s)", (overrides, reason) => {
    expect(selfHealEligibility(row(overrides), NOW)).toEqual({ eligible: false, reason });
  });

  it("re-reads a 'processing' row only once the run is provably dead", () => {
    const stale = new Date(NOW - STALE_PROCESSING_MS - 1000).toISOString();
    expect(
      selfHealEligibility(row({ processing_status: "processing", updated_at: stale }), NOW),
    ).toEqual({ eligible: true, reason: "stale_processing" });
  });
});

type Chain = Record<string, unknown>;

function buildAdmin(opts: { claimed: Array<{ id: string }>; jobRow?: unknown }) {
  const updates: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const from = vi.fn((table: string) => {
    const b: Chain = {};
    const passthrough = ["select", "eq", "is", "or", "order", "limit"];
    for (const m of passthrough) b[m] = vi.fn(() => b);
    b.maybeSingle = vi.fn(async () => ({
      data: table === "applications" ? (opts.jobRow ?? null) : null,
      error: null,
    }));
    b.update = vi.fn((payload: Record<string, unknown>) => {
      updates.push({ table, payload });
      return b;
    });
    // awaiting the chain (after .select("id") on an update) resolves the claim
    b.then = (resolve: (v: unknown) => void) =>
      resolve({ data: table === "candidates" ? opts.claimed : [], error: null });
    return b;
  });
  return { from, updates };
}

const JOB_ROW = { job_id: "job-1", jobs: { organisation_id: "org-client" } };

beforeEach(() => {
  enqueueSpy.mockReset();
  warn.mockClear();
});

describe("maybeSelfHealCandidateParse", () => {
  it("claims the row and queues one durable cv-parse-retry with job + org context", async () => {
    enqueueSpy.mockResolvedValue({ id: "evt-1" });
    const admin = buildAdmin({ claimed: [{ id: "56692e3c" }], jobRow: JOB_ROW });

    const result = await maybeSelfHealCandidateParse(row(), { admin: admin as never, now: NOW });

    expect(result).toEqual({ queued: true, reason: "pending_unparsed" });
    expect(admin.updates).toEqual([
      {
        table: "candidates",
        payload: expect.objectContaining({ processing_status: "processing" }),
      },
    ]);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const [name, payload, options] = enqueueSpy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { id: string },
    ];
    expect(name).toBe("cv-parse-retry");
    expect(payload).toMatchObject({
      candidateId: "56692e3c-c092-4d42-9883-957368665932",
      jobId: "job-1",
      organisationId: "org-client",
      source: "profile_self_heal",
    });
    expect(options.id).toMatch(/^cv-parse-self-heal:56692e3c/);
    expect(warn).toHaveBeenCalledWith(
      "candidate_profile_self_heal_enqueued",
      expect.objectContaining({ jobId: "job-1" }),
    );
  });

  it("queues nothing when another page load already claimed the row", async () => {
    const admin = buildAdmin({ claimed: [], jobRow: JOB_ROW });
    const result = await maybeSelfHealCandidateParse(row(), { admin: admin as never, now: NOW });
    expect(result).toEqual({ queued: false, reason: "lost_race" });
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("releases the claim when no queue is configured so the manual button still works", async () => {
    enqueueSpy.mockResolvedValue({});
    const admin = buildAdmin({ claimed: [{ id: "56692e3c" }], jobRow: JOB_ROW });
    const result = await maybeSelfHealCandidateParse(row(), { admin: admin as never, now: NOW });
    expect(result).toEqual({ queued: false, reason: "queue_unavailable" });
    expect(admin.updates.map((u) => u.payload.processing_status)).toEqual([
      "processing",
      "pending",
    ]);
  });

  it("does not touch the row when the candidate has no job to score against", async () => {
    const admin = buildAdmin({ claimed: [{ id: "x" }], jobRow: null });
    const result = await maybeSelfHealCandidateParse(row(), { admin: admin as never, now: NOW });
    expect(result).toEqual({ queued: false, reason: "no_job_context" });
    expect(admin.updates).toEqual([]);
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it("never spends on rows the parser already gave up on", async () => {
    const admin = buildAdmin({ claimed: [{ id: "x" }], jobRow: JOB_ROW });
    const result = await maybeSelfHealCandidateParse(row({ processing_status: "failed" }), {
      admin: admin as never,
      now: NOW,
    });
    expect(result).toEqual({ queued: false, reason: "status_failed" });
    expect(admin.from).not.toHaveBeenCalled();
  });
});
