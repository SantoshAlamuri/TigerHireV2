import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildIdibuWebhookUrl,
  isIdibuCredentialsComplete,
  isIdibuPostingReady,
} from "@/lib/integrations/idibu/credentials";

describe("idibu credentials helpers", () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "IDIBU_APP_ID",
      "IDIBU_APP_SECRET",
      "IDIBU_INTEGRATION_NAME",
      "IDIBU_WEBHOOK_SECRET",
      "IDIBU_DEFAULT_SECTOR",
      "ALLOW_JOB_BOARD_GLOBAL_FALLBACK",
    ]) {
      envBackup[key] = process.env[key];
    }
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("isIdibuCredentialsComplete requires app id, secret, and webhook secret only", () => {
    expect(
      isIdibuCredentialsComplete({
        app_id: "a",
        app_secret: "b",
        integration_name: "",
        webhook_secret: "",
        default_sector: "1",
      }),
    ).toBe(false);
    expect(
      isIdibuCredentialsComplete({
        app_id: "a",
        app_secret: "b",
        integration_name: "",
        webhook_secret: "sec",
        default_sector: "1",
      }),
    ).toBe(true);
  });

  it("isIdibuPostingReady requires integration name", () => {
    expect(
      isIdibuPostingReady({
        app_id: "a",
        app_secret: "b",
        integration_name: "",
        webhook_secret: "sec",
        default_sector: "1",
      }),
    ).toBe(false);
    expect(
      isIdibuPostingReady({
        app_id: "a",
        app_secret: "b",
        integration_name: "tigerhire",
        webhook_secret: "",
        default_sector: "1",
      }),
    ).toBe(true);
  });

  it("buildIdibuWebhookUrl includes organisation id", () => {
    const orgId = "00000000-0000-4000-8000-000000000099";
    expect(buildIdibuWebhookUrl(orgId, "https://app.example.com")).toBe(
      `https://app.example.com/api/webhooks/idibu/${orgId}`,
    );
  });
});
