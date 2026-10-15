import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("env validation", () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextPhase = process.env.NEXT_PHASE;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
    process.env.NEXT_PHASE = originalNextPhase;
  });

  it("validateEnv throws when required vars missing in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;

    const { validateEnv } = await import("@/lib/config/env");
    expect(() => validateEnv()).toThrow("Environment validation failed:");
  });

  it("validateEnv is a no-op in development", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const { validateEnv } = await import("@/lib/config/env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv is a no-op in test", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    const { validateEnv } = await import("@/lib/config/env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("env getters return values from process.env", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY = "pk_test_123";

    const { env } = await import("@/lib/config/env");
    expect(env.supabaseUrl).toBe("https://test.supabase.co");
    expect(env.supabaseAnonKey).toBe("test-anon-key");
    expect(env.supabaseServiceRoleKey).toBe("test-service-key");
    expect(env.stripeSecretKey).toBe("sk_test_123");
    expect(env.stripePublishableKey).toBe("pk_test_123");
  });

  it("env getters return empty string for missing optional vars", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.RESEND_API_KEY;

    const { env } = await import("@/lib/config/env");
    expect(env.stripeSecretKey).toBe("");
    expect(env.anthropicApiKey).toBe("");
    expect(env.openaiApiKey).toBe("");
    expect(env.resendApiKey).toBe("");
  });

  it("env getters return test values in test environment", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const { env } = await import("@/lib/config/env");
    expect(env.supabaseUrl).toBe("test-NEXT_PUBLIC_SUPABASE_URL");
    expect(env.supabaseAnonKey).toBe("test-NEXT_PUBLIC_SUPABASE_ANON_KEY");
  });

  it("validateEnv validates build vars during build phase", async () => {
    process.env.NODE_ENV = "production";
    process.env.NEXT_PHASE = "phase-production-build";
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY; // Not required during build

    const { validateEnv } = await import("@/lib/config/env");
    expect(() => validateEnv()).not.toThrow();
  });

  it("validateEnv requires service role key in runtime production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.NEXT_PHASE;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.CRON_SECRET;

    const { validateEnv } = await import("@/lib/config/env");
    expect(() => validateEnv()).toThrow("Environment validation failed:");
  });

  it("env getters return default for resendFromEmail when missing", async () => {
    delete process.env.RESEND_FROM_EMAIL;

    const { env } = await import("@/lib/config/env");
    expect(env.resendFromEmail).toBe("noreply@app.tigerhire.io");
  });

  it("emailSandbox is true when EMAIL_MODE=sandbox (case-insensitive)", async () => {
    process.env.EMAIL_MODE = "Sandbox";
    const { env } = await import("@/lib/config/env");
    expect(env.emailSandbox).toBe(true);
  });

  it("emailSandbox is false when EMAIL_MODE unset or not sandbox", async () => {
    delete process.env.EMAIL_MODE;
    const { env } = await import("@/lib/config/env");
    expect(env.emailSandbox).toBe(false);
  });

  it("whatsappSandbox is true when WHATSAPP_MODE=sandbox", async () => {
    process.env.WHATSAPP_MODE = "sandbox";
    const { env } = await import("@/lib/config/env");
    expect(env.whatsappSandbox).toBe(true);
  });

  it("whatsappSandbox is false when WHATSAPP_MODE unset", async () => {
    delete process.env.WHATSAPP_MODE;
    const { env } = await import("@/lib/config/env");
    expect(env.whatsappSandbox).toBe(false);
  });

  it("isProductionOutboundHold is true when VERCEL_ENV=production and OUTBOUND_NOTIFICATIONS_ENABLED unset", async () => {
    process.env.VERCEL_ENV = "production";
    delete process.env.OUTBOUND_NOTIFICATIONS_ENABLED;
    const { env } = await import("@/lib/config/env");
    expect(env.isProductionOutboundHold).toBe(true);
    expect(env.outboundNotificationsEnabled).toBe(false);
  });

  it("isProductionOutboundHold is false when OUTBOUND_NOTIFICATIONS_ENABLED=true", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.OUTBOUND_NOTIFICATIONS_ENABLED = "true";
    const { env } = await import("@/lib/config/env");
    expect(env.isProductionOutboundHold).toBe(false);
    expect(env.outboundNotificationsEnabled).toBe(true);
  });

  it("isProductionOutboundHold is false when not production", async () => {
    process.env.VERCEL_ENV = "preview";
    delete process.env.OUTBOUND_NOTIFICATIONS_ENABLED;
    const { env } = await import("@/lib/config/env");
    expect(env.isProductionOutboundHold).toBe(false);
  });

  it("env getters return default for baseUrl when missing", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;

    const { env } = await import("@/lib/config/env");
    expect(env.baseUrl).toBe("https://tigerhire.io");
  });

  describe("optional voice configuration at production startup", () => {
    beforeEach(() => {
      process.env = {
        NODE_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
        SUPABASE_SERVICE_ROLE_KEY: "test-service",
        CRON_SECRET: "test-cron",
        BOLNA_API_KEY: "test-voice-key",
        BOLNA_AGENT_ID: "test-agent",
      };
    });

    it("allows startup without a purchased number and reports voice unavailable", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const { validateEnv } = await import("@/lib/config/env");
        expect(() => validateEnv()).not.toThrow();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining("bolna_voice_unavailable"));
      } finally {
        warn.mockRestore();
      }
    });

    it("still rejects a malformed configured number", async () => {
      process.env.BOLNA_FROM_PHONE_NUMBER = "not-a-number";
      const { validateEnv } = await import("@/lib/config/env");
      expect(() => validateEnv()).toThrow("BOLNA_FROM_PHONE_NUMBER must be E.164");
    });

    it("accepts a configured valid number", async () => {
      process.env.BOLNA_FROM_PHONE_NUMBER = "+12025550123";
      const { validateEnv } = await import("@/lib/config/env");
      expect(() => validateEnv()).not.toThrow();
    });

    it("still requires the cron credential and reports the reason", async () => {
      delete process.env.CRON_SECRET;
      const { validateEnv } = await import("@/lib/config/env");
      expect(() => validateEnv()).toThrow("Either CRON_SECRET or CRON_SECRET_HASH is required");
    });
  });
});
