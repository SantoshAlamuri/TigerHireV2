import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/screening-qa-flow", () => ({
  startCanonicalScreeningCollectionBestEffort: vi.fn().mockResolvedValue("asking"),
}));
vi.mock("@/lib/screening/canonical-scoring-gate", () => ({
  evaluateCanonicalScreeningGate: vi.fn(),
  recordCanonicalGateStatus: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/fitscore/hybrid/jd-base", () => ({
  getJdBaseByJobId: vi.fn(),
}));
vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  deletePendingJdApprovalPairs: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue({ id: "evt_1" }),
}));

import { isSessionNudgeDue, runScreeningReconciler } from "@/lib/whatsapp/screening-reconciler";
import { startCanonicalScreeningCollectionBestEffort } from "@/lib/whatsapp/screening-qa-flow";
import {
  evaluateCanonicalScreeningGate,
  recordCanonicalGateStatus,
} from "@/lib/screening/canonical-scoring-gate";
import { getJdBaseByJobId } from "@/lib/fitscore/hybrid/jd-base";
import { deletePendingJdApprovalPairs } from "@/lib/fitscore/pending-jd-approval";
import { enqueue } from "@/lib/jobs/queue";

const H = 60 * 60 * 1000;
// 15:00 IST so the calling-window check passes in sweep A.
const NOW = new Date("2026-08-19T09:30:00.000Z");

describe("isSessionNudgeDue", () => {
  const iso = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();

  it("is not stalled before the silence threshold", () => {
    expect(
      isSessionNudgeDue({
        lastMessageAt: iso(2 * H),
        createdAt: iso(3 * H),
        lastOutboundAt: null,
        now: NOW,
      }),
    ).toBe("not_stalled");
  });

  it("is due after 6h of silence with no recent outbound", () => {
    expect(
      isSessionNudgeDue({
        lastMessageAt: iso(8 * H),
        createdAt: iso(9 * H),
        lastOutboundAt: iso(30 * H),
        now: NOW,
      }),
    ).toBe("due");
  });

  it("holds the cooldown when we already sent within 24h", () => {
    expect(
      isSessionNudgeDue({
        lastMessageAt: iso(8 * H),
        createdAt: iso(9 * H),
        lastOutboundAt: iso(3 * H),
        now: NOW,
      }),
    ).toBe("cooldown");
  });

  it("gives up on sessions older than the max age", () => {
    expect(
      isSessionNudgeDue({
        lastMessageAt: iso(20 * 24 * H),
        createdAt: iso(30 * 24 * H),
        lastOutboundAt: null,
        now: NOW,
      }),
    ).toBe("too_old");
  });
});

/** Chainable query stub: every method returns itself; awaiting resolves `result`. */
function tableStub(result: unknown) {
  const stub: Record<string, unknown> = {};
  const chain = () => stub;
  for (const m of ["select", "eq", "lt", "gte", "in", "or", "order", "limit", "like"]) {
    stub[m] = vi.fn(chain);
  }
  stub.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  stub.insert = vi.fn().mockResolvedValue({ error: null });
  stub.update = vi.fn(chain);

  (stub as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return stub;
}

function makeAdmin(tables: Record<string, unknown>) {
  return {
    from: vi.fn((name: string) => tables[name] ?? tableStub({ data: [], error: null })),
  } as never;
}

describe("runScreeningReconciler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("repairs a stalled armed session via the canonical starter", async () => {
    const eightHoursAgo = new Date(NOW.getTime() - 8 * H).toISOString();
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({
        data: [
          {
            phone: "919885674488",
            last_message_at: eightHoursAgo,
            created_at: eightHoursAgo,
            context: { screening_job_id: "job-1", candidate_id: "cand-1" },
          },
        ],
        error: null,
      }),
      whatsapp_message_log: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({ data: [], error: null }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.sessionsRepaired).toBe(1);
    expect(startCanonicalScreeningCollectionBestEffort).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        candidateId: "cand-1",
        source: "screening-reconciler",
      }),
    );
  });

  it("records a gate that was evaluated as passed but never written", async () => {
    vi.mocked(evaluateCanonicalScreeningGate).mockResolvedValue({
      applies: true,
      block: false,
    } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [{ job_id: "job-1" }], error: null }),
      applications: tableStub({
        data: [{ id: "app-1", job_id: "job-1", candidate_id: "cand-1", gate_status: null }],
        error: null,
      }),
      pending_jd_approval: tableStub({ data: [], error: null }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.gatesRecorded).toBe(1);
    expect(recordCanonicalGateStatus).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "job-1", candidateId: "cand-1", gateStatus: "passed" }),
    );
  });

  it("re-enqueues with an id distinct from the approve route, or Inngest dedupes the retry away", async () => {
    vi.mocked(getJdBaseByJobId).mockResolvedValue({
      approvedBy: "user-1",
      version: 3,
    } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({
        data: [{ job_id: "job-9", candidate_id: "c1", enqueued_at: null, attempted_at: null }],
        error: null,
      }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.reconcilesEnqueued).toBe(1);
    const [, , opts] = vi.mocked(enqueue).mock.calls[0];
    // Must NOT equal the approve route's id (job:version), which would dedupe.
    expect(opts?.id).not.toBe("jd-base-approval-reconcile:job-9:3");
    expect(opts?.id).toMatch(/^jd-base-approval-reconcile:job-9:3:recon-\d{10}$/);
  });

  it("backs off instead of re-enqueueing a job retried within the window", async () => {
    vi.mocked(getJdBaseByJobId).mockResolvedValue({ approvedBy: "u", version: 1 } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({
        data: [
          {
            job_id: "job-9",
            candidate_id: "c1",
            enqueued_at: new Date(NOW.getTime() - 2 * H).toISOString(),
            attempted_at: new Date(NOW.getTime() - 1 * H).toISOString(),
          },
        ],
        error: null,
      }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.reconcilesEnqueued).toBe(0);
    expect(summary.pairsAwaitingRetry).toBe(1);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("escalates pairs that have outlived a week of retries", async () => {
    vi.mocked(getJdBaseByJobId).mockResolvedValue({ approvedBy: "u", version: 1 } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({
        data: [
          {
            job_id: "job-old",
            candidate_id: "c1",
            enqueued_at: new Date(NOW.getTime() - 40 * 24 * H).toISOString(),
            attempted_at: null,
          },
        ],
        error: null,
      }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.stuckJobs).toHaveLength(1);
    expect(summary.stuckJobs[0]).toMatchObject({ jobId: "job-old", pairs: 1 });
    expect(summary.stuckJobs[0].ageDays).toBeGreaterThanOrEqual(7);
  });

  it("deletes stale rows whose pair is already scored instead of retrying forever", async () => {
    vi.mocked(getJdBaseByJobId).mockResolvedValue({ approvedBy: "u", version: 1 } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({
        data: [{ job_id: "job-9", candidate_id: "c1", enqueued_at: null, attempted_at: null }],
        error: null,
      }),
      // c1 already has a score: the queue row is debris, not a stray.
      fit_scores: tableStub({ data: [{ candidate_id: "c1" }], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.pairsCleared).toBe(1);
    expect(summary.strandedPairsFound).toBe(0);
    expect(deletePendingJdApprovalPairs).toHaveBeenCalledWith(expect.anything(), "job-9", ["c1"]);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("leaves unapproved pending pairs alone — that hold is a human decision", async () => {
    vi.mocked(getJdBaseByJobId).mockResolvedValue({ approvedBy: null, version: 1 } as never);
    const admin = makeAdmin({
      whatsapp_sessions: tableStub({ data: [], error: null }),
      job_screening_questions: tableStub({ data: [], error: null }),
      pending_jd_approval: tableStub({
        data: [{ job_id: "job-9", candidate_id: "c1", enqueued_at: null, attempted_at: null }],
        error: null,
      }),
      fit_scores: tableStub({ data: [], error: null }),
      agent_logs: tableStub({ error: null }),
    });

    const summary = await runScreeningReconciler(admin, { now: NOW });
    expect(summary.reconcilesEnqueued).toBe(0);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
