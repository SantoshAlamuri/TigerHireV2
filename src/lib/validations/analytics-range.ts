import { z } from "zod";

/** Accepts `YYYY-MM-DD` (date inputs) and ISO strings. */
export function parseAnalyticsInstant(s: string): number | null {
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}

export const analyticsRangeQuerySchema = z
  .object({
    jobId: z.string().uuid().optional(),
    dateFrom: z.string().max(64).optional(),
    dateTo: z.string().max(64).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.dateFrom != null) {
      if (parseAnalyticsInstant(data.dateFrom) == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateFrom"],
          message: "dateFrom is not a valid date",
        });
      }
    }
    if (data.dateTo != null) {
      if (parseAnalyticsInstant(data.dateTo) == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["dateTo"],
          message: "dateTo is not a valid date",
        });
      }
    }
    const fromT = data.dateFrom != null ? parseAnalyticsInstant(data.dateFrom) : null;
    const toT = data.dateTo != null ? parseAnalyticsInstant(data.dateTo) : null;
    if (fromT != null && toT != null && fromT > toT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["dateFrom"],
        message: "dateFrom must be on or before dateTo",
      });
    }
  });

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeQuerySchema>;

export function normalizeAnalyticsRangeRaw(raw: {
  jobId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
}): { jobId?: string; dateFrom?: string; dateTo?: string } {
  const trimOrUndef = (v: string | null | undefined) => {
    if (v == null) return undefined;
    const t = v.trim();
    return t === "" ? undefined : t;
  };
  return {
    jobId: trimOrUndef(raw.jobId ?? undefined),
    dateFrom: trimOrUndef(raw.dateFrom ?? undefined),
    dateTo: trimOrUndef(raw.dateTo ?? undefined),
  };
}
