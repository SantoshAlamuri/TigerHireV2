import { describe, expect, it } from "vitest";
import {
  analyticsRangeQuerySchema,
  normalizeAnalyticsRangeRaw,
} from "@/lib/validations/analytics-range";

describe("analyticsRangeQuerySchema", () => {
  it("accepts jobId only", () => {
    const r = analyticsRangeQuerySchema.safeParse(
      normalizeAnalyticsRangeRaw({ jobId: "550e8400-e29b-41d4-a716-446655440000" }),
    );
    expect(r.success).toBe(true);
  });

  it("accepts partial date range", () => {
    expect(
      analyticsRangeQuerySchema.safeParse(normalizeAnalyticsRangeRaw({ dateFrom: "2026-01-01" }))
        .success,
    ).toBe(true);
    expect(
      analyticsRangeQuerySchema.safeParse(normalizeAnalyticsRangeRaw({ dateTo: "2026-12-31" }))
        .success,
    ).toBe(true);
  });

  it("accepts from and to in order", () => {
    const r = analyticsRangeQuerySchema.safeParse(
      normalizeAnalyticsRangeRaw({ dateFrom: "2026-01-01", dateTo: "2026-01-31" }),
    );
    expect(r.success).toBe(true);
  });

  it("rejects when from is after to", () => {
    const r = analyticsRangeQuerySchema.safeParse(
      normalizeAnalyticsRangeRaw({ dateFrom: "2026-02-01", dateTo: "2026-01-01" }),
    );
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.message.includes("before dateTo"))).toBe(true);
    }
  });

  it("rejects invalid date strings", () => {
    const r = analyticsRangeQuerySchema.safeParse(
      normalizeAnalyticsRangeRaw({ dateFrom: "not-a-date" }),
    );
    expect(r.success).toBe(false);
  });

  it("maps empty strings to undefined via normalize", () => {
    const r = normalizeAnalyticsRangeRaw({
      jobId: "",
      dateFrom: "  ",
      dateTo: null,
    });
    expect(r).toEqual({});
  });
});
