import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("logger", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("logs info messages in development", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("test message", { user_id: "u1" });
    const output = String(spy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("[INFO] test message");
    expect(output).toContain('"user_id":"u1"');
    spy.mockRestore();
  });

  it("logs to stdout as JSON in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("prod message");
    expect(spy).toHaveBeenCalled();
    const output = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output.trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("prod message");
    spy.mockRestore();
  });

  it("redacts email addresses in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("test", { user_id: "jane@example.com" });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[email redacted]");
    expect(output).not.toContain("jane@example.com");
    spy.mockRestore();
  });

  it("redacts phone numbers in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("test", { phone: "+91 98765 43210" });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[phone redacted]");
    spy.mockRestore();
  });

  it("skips debug logs in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.debug("debug msg");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("logs debug messages in development", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.debug("debug msg");
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toContain("[DEBUG] debug msg");
    spy.mockRestore();
  });

  it("logs agent events with agent name", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.agent("scout", { job_id: "j1" });
    const output = String(spy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("[INFO] agent:scout");
    expect(output).toContain('"agent":"scout"');
    expect(output).toContain('"job_id":"j1"');
    spy.mockRestore();
  });

  it("logs warn messages", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.warn("watch out");
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toContain("[WARN] watch out");
    spy.mockRestore();
  });

  it("logs error messages", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.error("something broke", { error: "details" });
    const output = String(spy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("[ERROR] something broke");
    expect(output).toContain('"error":"details"');
    spy.mockRestore();
  });

  it("includes timestamp in production JSON", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("ts-check");
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.timestamp).toBeDefined();
    expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    spy.mockRestore();
  });

  it("does not redact in development mode", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("dev", { user_id: "jane@example.com" });
    const output = String(spy.mock.calls[0]?.[0] ?? "");
    expect(output).toContain("jane@example.com");
    spy.mockRestore();
  });

  it("redacts nested objects in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("nested", {
      details: { contact: "test@mail.com" } as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).toContain("[email redacted]");
    expect(output).not.toContain("test@mail.com");
    spy.mockRestore();
  });

  it("preserves null values in redaction", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("nulls", { candidate_id: null as unknown as string });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.candidate_id).toBeNull();
    spy.mockRestore();
  });

  it("preserves non-string, non-object values in redaction", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("numbers", { tokens_used: 500 });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.tokens_used).toBe(500);
    spy.mockRestore();
  });

  it("logs with no meta in development without error", async () => {
    process.env.NODE_ENV = "development";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("no-meta");
    expect(String(spy.mock.calls[0]?.[0] ?? "")).toBe("[INFO] no-meta\n");
    spy.mockRestore();
  });

  it("preserves array values in production redaction", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("arrays", {
      signal_sources: ["linkedin", "github"] as unknown as string,
    });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.signal_sources).toEqual(["linkedin", "github"]);
    spy.mockRestore();
  });

  it("writes warn level as JSON in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.warn("deprecation warning");
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.level).toBe("warn");
    expect(parsed.message).toBe("deprecation warning");
    spy.mockRestore();
  });

  it("writes error level as JSON in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.error("critical failure", { error: "stack trace" });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.level).toBe("error");
    expect(parsed.message).toBe("critical failure");
    expect(parsed.error).toBe("stack trace");
    spy.mockRestore();
  });

  it("agent logger outputs JSON in production", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.agent("fitscore", { duration_ms: 1500, tokens_used: 200 });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("agent:fitscore");
    expect(parsed.agent).toBe("fitscore");
    expect(parsed.duration_ms).toBe(1500);
    spy.mockRestore();
  });

  it("redacts multiple emails in a single string", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("multi-email", {
      note: "Contact a@b.com or c@d.com" as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("a@b.com");
    expect(output).not.toContain("c@d.com");
    expect(output).toContain("[email redacted]");
    spy.mockRestore();
  });

  it("does not redact short non-phone strings", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("short", { user_id: "abc-123" });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.user_id).toBe("abc-123");
    spy.mockRestore();
  });

  it("handles boolean values in metadata", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("booleans", {
      active: true as unknown as string,
    });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.active).toBe(true);
    spy.mockRestore();
  });

  // --- PII-001: redaction recurses into arrays + key denylist + more PII types ---

  it("redacts email and phone inside an array of candidate objects (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("export", {
      candidates: [
        { email: "jane@example.com", phone: "+91 98765 43210" },
        { email: "bob@example.com" },
      ] as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("jane@example.com");
    expect(output).not.toContain("bob@example.com");
    expect(output).not.toContain("98765 43210");
    expect(output).toContain("[email redacted]");
    expect(output).toContain("[phone redacted]");
    spy.mockRestore();
  });

  it("redacts PII inside nested arrays of arrays (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("nested-arrays", {
      groups: [[{ email: "deep@example.com" }]] as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("deep@example.com");
    expect(output).toContain("[email redacted]");
    spy.mockRestore();
  });

  it("redacts denylisted keys whose values are not pattern-matchable (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("denylist", {
      full_name: "John Doe" as unknown as string,
      salary: 5000000 as unknown as string,
      cv_raw_text: "Experienced engineer based in Bengaluru" as unknown as string,
    });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.full_name).toBe("[redacted]");
    expect(parsed.salary).toBe("[redacted]");
    expect(parsed.cv_raw_text).toBe("[redacted]");
    spy.mockRestore();
  });

  it("redacts denylisted keys inside arrays of objects (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("array-denylist", {
      people: [{ full_name: "Jane Roe", role: "recruiter" }] as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("Jane Roe");
    expect(output).toContain("[redacted]");
    // Non-PII sibling field is preserved.
    expect(output).toContain('"role":"recruiter"');
    spy.mockRestore();
  });

  it("redacts national IDs (PAN / Aadhaar / SSN) in string values (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("ids", {
      note: "PAN ABCDE1234F, Aadhaar 1234 5678 9012, SSN 123-45-6789" as unknown as string,
    });
    const output = spy.mock.calls[0][0] as string;
    expect(output).not.toContain("ABCDE1234F");
    expect(output).not.toContain("1234 5678 9012");
    expect(output).not.toContain("123-45-6789");
    expect(output).toContain("[id redacted]");
    spy.mockRestore();
  });

  it("leaves non-PII fields unchanged when redacting (PII-001)", async () => {
    process.env.NODE_ENV = "production";
    const spy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const { logger } = await import("@/lib/observability/logger");
    logger.info("mixed", {
      job_id: "job-123",
      count: 42 as unknown as string,
      candidates: [{ id: "c-1", email: "x@y.com" }] as unknown as string,
    });
    const parsed = JSON.parse((spy.mock.calls[0][0] as string).trim());
    expect(parsed.job_id).toBe("job-123");
    expect(parsed.count).toBe(42);
    expect(parsed.candidates[0].id).toBe("c-1");
    expect(parsed.candidates[0].email).toBe("[email redacted]");
    spy.mockRestore();
  });
});
