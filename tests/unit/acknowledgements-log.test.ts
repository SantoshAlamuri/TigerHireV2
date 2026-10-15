import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdmin: vi.fn(),
}));

describe("acknowledgements/log", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("writes attempt rows to candidate_acknowledgement_attempts", async () => {
    const builder = createMockQueryBuilder({ data: null, error: null });
    const supabase = {
      from: vi.fn(() => builder),
    };
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    await logCandidateAcknowledgementAttempt({
      applicationId: "app-1",
      candidateId: "cand-1",
      jobId: "job-1",
      eventType: "cv_ingested",
      ingestionPath: "public_apply",
      channel: "email",
      templateVariant: "direct_apply_received",
      outcome: "sent",
      provider: "resend",
      providerMessageId: "msg_1",
      dedupeKey: "app-1:cv_ingested:email:direct_apply_received:2026-04-28",
    });

    expect(supabase.from).toHaveBeenCalledWith("candidate_acknowledgement_attempts");
    expect(builder.upsert).toHaveBeenCalledOnce();
  });

  it("logs warning when insert returns an error", async () => {
    const builder = createMockQueryBuilder({ data: null, error: { message: "boom", code: "500" } });
    const supabase = {
      from: vi.fn(() => builder),
    };
    const { createSupabaseAdmin } = await import("@/lib/supabase/admin");
    const { logger } = await import("@/lib/observability/logger");
    (createSupabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { logCandidateAcknowledgementAttempt } = await import("@/lib/acknowledgements/log");
    await logCandidateAcknowledgementAttempt({
      candidateId: "cand-1",
      eventType: "cv_ingested",
      ingestionPath: "public_apply",
      channel: "whatsapp",
      outcome: "failed_provider",
      reasonCode: "provider_error",
      dedupeKey: "cand-1:cv_ingested:whatsapp:default:2026-04-28",
    });

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to write candidate acknowledgement attempt",
      expect.objectContaining({ code: "500" }),
    );
  });
});
