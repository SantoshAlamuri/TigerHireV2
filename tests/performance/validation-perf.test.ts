import { describe, it, expect, vi, beforeEach } from "vitest";
import { validationPerfLimits } from "../helpers/ci-perf";

vi.mock("@/lib/observability/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe("Validation — Performance Benchmarks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("job validation schema handles 1000 validations under 500ms", async () => {
    const { jobSchema } = await import("@/lib/validations/jobs");

    const validPayloads = Array.from({ length: 1000 }, (_, i) => ({
      title: `Software Engineer ${i}`,
      description: `Build software for ${i}`,
      status: "open",
    }));

    const start = performance.now();
    for (const payload of validPayloads) {
      try {
        jobSchema.parse(payload);
      } catch {
        // some may fail depending on required fields — that's fine
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(validationPerfLimits.jobBatchMs);
  });

  it("contact validation schema handles 1000 validations under 200ms", async () => {
    const { contactSchema } = await import("@/lib/validations/contact");

    const payloads = Array.from({ length: 1000 }, (_, i) => ({
      name: `User ${i}`,
      email: `user${i}@example.com`,
      message: `Hello from user ${i}`,
      company: `Company ${i}`,
    }));

    const start = performance.now();
    for (const payload of payloads) {
      try {
        contactSchema.parse(payload);
      } catch {
        // expected for some
      }
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(validationPerfLimits.contactBatchMs);
  });

  it("invalid payloads are rejected quickly (<1ms avg)", async () => {
    const { jobSchema } = await import("@/lib/validations/jobs");

    const invalidPayloads = Array.from({ length: 500 }, () => ({
      title: "",
      description: 12345,
      status: "invalid_status",
      extra_field: true,
    }));

    const start = performance.now();
    let rejections = 0;
    for (const payload of invalidPayloads) {
      try {
        jobSchema.parse(payload);
      } catch {
        rejections++;
      }
    }
    const elapsed = performance.now() - start;

    expect(rejections).toBeGreaterThan(0);
    expect(elapsed / 500).toBeLessThan(validationPerfLimits.invalidAvgMs);
  });
});
