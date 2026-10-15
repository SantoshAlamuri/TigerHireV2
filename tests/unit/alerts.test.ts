import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createMockQueryBuilder } from "../helpers";

vi.mock("@/lib/observability/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    agent: vi.fn(),
  },
}));

import { sendCostAlert, checkDailyCostThreshold } from "@/lib/observability/alerts";
import { logger } from "@/lib/observability/logger";

describe("sendCostAlert", () => {
  let originalWebhook: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    originalWebhook = process.env.SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    if (originalWebhook !== undefined) {
      process.env.SLACK_WEBHOOK_URL = originalWebhook;
    } else {
      delete process.env.SLACK_WEBHOOK_URL;
    }
  });

  it("logs the cost alert", async () => {
    await sendCostAlert("fitscore", 75, "job-1");
    expect(logger.error).toHaveBeenCalledWith(
      "COST_ALERT: agent run exceeded INR 50 threshold",
      expect.objectContaining({
        agent: "fitscore",
        cost_inr: 75,
        job_id: "job-1",
      }),
    );
  });

  it("logs with undefined job_id when refId is null", async () => {
    await sendCostAlert("scout", 60, null);
    expect(logger.error).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ job_id: undefined }),
    );
  });

  it("sends to Slack when webhook URL is set", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    vi.resetModules();
    const { sendCostAlert: freshSendCostAlert } = await import("@/lib/observability/alerts");
    await freshSendCostAlert("fitscore", 100, "job-x");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://hooks.slack.com/test",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("COST_ALERT"),
      }),
    );
    fetchSpy.mockRestore();
  });

  it("does not send to Slack when webhook URL is unset", async () => {
    delete process.env.SLACK_WEBHOOK_URL;
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));

    await sendCostAlert("scout", 55, null);

    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe("checkDailyCostThreshold", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The spend source is budget_state (paise), not agent_logs.cost_inr — that
  // column does not exist, so the old fixture asserted a contract the database
  // never had and the alert could not fire in production regardless of spend.
  it("does not alert when daily total is below INR 800", async () => {
    const builder = createMockQueryBuilder();
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: { spend_inr_paise: 30_000 },
      error: null,
    });
    const mockSupabase = { from: vi.fn(() => builder) } as any;

    await checkDailyCostThreshold(mockSupabase);

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining("daily spend"),
      expect.anything(),
    );
  });

  it("alerts when daily total exceeds INR 800", async () => {
    const builder = createMockQueryBuilder();
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: { spend_inr_paise: 90_000 },
      error: null,
    });
    const mockSupabase = { from: vi.fn(() => builder) } as any;

    await checkDailyCostThreshold(mockSupabase);

    expect(logger.error).toHaveBeenCalledWith(
      "COST_ALERT: daily spend exceeded INR 800",
      expect.objectContaining({ cost_inr: 900 }),
    );
  });

  it("handles null data gracefully", async () => {
    const builder = createMockQueryBuilder();
    builder.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const mockSupabase = { from: vi.fn(() => builder) } as any;

    await expect(checkDailyCostThreshold(mockSupabase)).resolves.toBeUndefined();
  });

  it("treats a null spend figure as zero", async () => {
    const builder = createMockQueryBuilder();
    builder.maybeSingle = vi.fn().mockResolvedValue({
      data: { spend_inr_paise: null },
      error: null,
    });
    const mockSupabase = { from: vi.fn(() => builder) } as any;

    await checkDailyCostThreshold(mockSupabase);

    expect(logger.error).not.toHaveBeenCalledWith(
      expect.stringContaining("daily spend"),
      expect.anything(),
    );
  });
});
