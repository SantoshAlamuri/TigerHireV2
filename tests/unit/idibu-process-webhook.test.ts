import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

const mockComputeSingle = vi.fn().mockResolvedValue({ scoring_status: "scored" });
const mockRecordPlatformCostEvent = vi.fn().mockResolvedValue({ externalId: "x", error: null });
const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: () => ({
    from: mockFrom,
    storage: { from: mockStorageFrom },
    // webhook_event_try_acquire idempotency RPC: resolve as "acquired" so processing proceeds.
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
  }),
}));

vi.mock("@/lib/services/FitScoreService", () => ({
  FitScoreService: {
    computeSingle: (...args: unknown[]) => mockComputeSingle(...args),
  },
}));

vi.mock("@/lib/fitscore/pending-jd-approval", () => ({
  isJdBaseApproved: vi.fn().mockResolvedValue(true),
  enqueuePendingJdApprovalPair: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueue: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/costs/ledger", () => ({
  recordPlatformCostEvent: (...args: unknown[]) => mockRecordPlatformCostEvent(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/observability/scoring-dlq", () => ({
  pushScoringDlq: vi.fn().mockResolvedValue(undefined),
}));

const JOB_ID = "00000000-0000-4000-8000-000000000001";
const CAND_ID = "00000000-0000-4000-8000-000000000099";

function setupHappyPathMocks(options?: { existingCandidate?: boolean; existingApp?: boolean }) {
  mockStorageFrom.mockReturnValue({
    upload: vi.fn().mockResolvedValue({ error: null }),
    getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "https://storage/cv.pdf" } }),
  });

  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "application/pdf" },
    arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
  }) as unknown as typeof fetch;

  mockFrom.mockImplementation((table: string) => {
    if (table === "jobs") {
      return createMockQueryBuilder({
        data: { id: JOB_ID, organisation_id: "org-1", title: "Engineer", status: "open" },
      });
    }
    if (table === "candidates") {
      if (options?.existingCandidate) {
        return createMockQueryBuilder({ data: [{ id: CAND_ID }] });
      }
      return createMockQueryBuilder({ data: { id: CAND_ID } });
    }
    if (table === "applications") {
      if (options?.existingApp) {
        return createMockQueryBuilder({ data: { id: "app-1" } });
      }
      return createMockQueryBuilder({ data: [{ id: "app-new" }] });
    }
    if (table === "pipeline_candidates") {
      return createMockQueryBuilder({ data: [] });
    }
    if (table === "pipeline_stages") {
      return createMockQueryBuilder({ data: { id: "stage-1" } });
    }
    if (table === "idibu_dead_letter") {
      return createMockQueryBuilder({ data: null });
    }
    return createMockQueryBuilder();
  });
}

describe("processIdibuWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.INNGEST_EVENT_KEY = "test-key";
  });

  it("writes dead letter when job id does not exist", async () => {
    const deadLetterInsert = vi.fn().mockReturnValue(createMockQueryBuilder());
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return createMockQueryBuilder({ data: null });
      }
      if (table === "idibu_dead_letter") {
        return { insert: deadLetterInsert };
      }
      return createMockQueryBuilder();
    });

    const { processIdibuWebhook } = await import("@/lib/integrations/idibu/process-webhook");
    const result = await processIdibuWebhook({
      payload: {
        id: "idibu-x",
        email: "ghost@example.com",
        vacancies: [{ reference: JOB_ID }],
      },
    });
    expect(result.outcome).toBe("dead_letter");
    expect(deadLetterInsert).toHaveBeenCalled();
  });

  it("writes dead letter when vacancy reference is missing", async () => {
    const deadLetterInsert = vi.fn().mockReturnValue(createMockQueryBuilder());
    mockFrom.mockImplementation((table: string) => {
      if (table === "idibu_dead_letter") {
        return { insert: deadLetterInsert };
      }
      return createMockQueryBuilder();
    });

    const { processIdibuWebhook } = await import("@/lib/integrations/idibu/process-webhook");
    const result = await processIdibuWebhook({
      payload: { email: "a@b.com", vacancies: [] },
    });
    expect(result.outcome).toBe("dead_letter");
    expect(deadLetterInsert).toHaveBeenCalled();
  });

  it("skips duplicate application for same job", async () => {
    setupHappyPathMocks({ existingCandidate: true, existingApp: true });
    const { processIdibuWebhook } = await import("@/lib/integrations/idibu/process-webhook");
    const result = await processIdibuWebhook({
      payload: {
        id: "idibu-1",
        email: "ada@example.com",
        source: "Indeed",
        vacancies: [{ reference: JOB_ID }],
        attachments: [{ type: "cv_doc", file_link: "https://example.com/cv.pdf" }],
      },
    });
    expect(result.outcome).toBe("duplicate");
    expect(mockComputeSingle).not.toHaveBeenCalled();
  });

  it("creates candidate with pending_cv when cv_doc attachment is missing", async () => {
    setupHappyPathMocks();
    let candidateInsertPayload: Record<string, unknown> | null = null;
    mockFrom.mockImplementation((table: string) => {
      if (table === "jobs") {
        return createMockQueryBuilder({
          data: { id: JOB_ID, organisation_id: "org-1", title: "Engineer", status: "open" },
        });
      }
      if (table === "candidates") {
        const insertBuilder = createMockQueryBuilder({ data: { id: CAND_ID } });
        return {
          select: vi.fn().mockReturnValue(createMockQueryBuilder({ data: [] })),
          insert: vi.fn((row: Record<string, unknown>) => {
            candidateInsertPayload = row;
            return insertBuilder;
          }),
          update: vi.fn().mockReturnValue(createMockQueryBuilder()),
        };
      }
      if (table === "applications") {
        return createMockQueryBuilder({ data: [{ id: "app-new" }] });
      }
      if (table === "pipeline_candidates") {
        return createMockQueryBuilder({ data: [] });
      }
      if (table === "pipeline_stages") {
        return createMockQueryBuilder({ data: { id: "stage-1" } });
      }
      return createMockQueryBuilder();
    });

    const { processIdibuWebhook } = await import("@/lib/integrations/idibu/process-webhook");
    const result = await processIdibuWebhook({
      payload: {
        id: "idibu-2",
        firstname: "Grace",
        lastname: "Hopper",
        email: "grace@example.com",
        source: "Foundit",
        vacancies: [{ reference: JOB_ID }],
        attachments: [],
      },
    });
    expect(result.outcome).toBe("cv_failed");
    expect(candidateInsertPayload?.processing_status).toBe("pending_cv");
    expect(mockComputeSingle).not.toHaveBeenCalled();
  });

  it("records platform cost event on successful ingest", async () => {
    setupHappyPathMocks();
    const { processIdibuWebhook } = await import("@/lib/integrations/idibu/process-webhook");
    await processIdibuWebhook({
      payload: {
        id: "idibu-3",
        firstname: "Alan",
        lastname: "Turing",
        email: "alan@example.com",
        source: "Indeed",
        vacancies: [{ reference: JOB_ID }],
        attachments: [{ type: "cv_doc", file_link: "https://example.com/cv.pdf" }],
      },
    });
    expect(mockRecordPlatformCostEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "tigerhire",
        service: "idibu_webhook",
        metadata: expect.objectContaining({ source: "idibu_webhook", board: "Indeed" }),
      }),
    );
  });
});
