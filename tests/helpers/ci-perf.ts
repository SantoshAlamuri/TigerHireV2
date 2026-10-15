/**
 * CI runners (e.g. GitHub Actions `ubuntu-latest`) are shared and noisy.
 * Performance tests keep strict budgets locally but relax them when `CI=true`
 * so jobs verify regressions without flaky red builds.
 */
export const isCiRunner = process.env.CI === "true";

export const circuitBreakerPerfLimits = {
  minThroughputOpsPerSec: isCiRunner ? 6_000 : 50_000,
  minGetStateOpsPerSec: isCiRunner ? 120_000 : 1_000_000,
  maxAvgTransitionMs: isCiRunner ? 35 : 5,
} as const;

export const serviceBenchmarkLimits = {
  listAvgMs: isCiRunner ? 25 : 5,
  listP95Ms: isCiRunner ? 45 : 10,
  getByIdAvgMs: isCiRunner ? 12 : 2,
  getByIdMinOpsPerSec: isCiRunner ? 40 : 100,
  mutationAvgMs: isCiRunner ? 25 : 5,
} as const;

export const validationPerfLimits = {
  jobBatchMs: isCiRunner ? 2_500 : 500,
  contactBatchMs: isCiRunner ? 900 : 200,
  invalidAvgMs: isCiRunner ? 4 : 1,
} as const;

/** Large JSON payloads (list-like API shapes) — regression guard for serialization cost. */
export const serializationPerfLimits = {
  /** 2k small records: stringify + parse total wall time. */
  batchRoundtripMs: isCiRunner ? 2_000 : 250,
} as const;

/** Pure cache-key builders — must stay allocation-light for hot paths. */
export const keyBuilderPerfLimits = {
  /** 50k key derivations total wall time. */
  fiftyKKeyBuildsMs: isCiRunner ? 900 : 120,
} as const;

/** api-helpers Zod error formatting — called on many bad requests. */
export const zodErrorHandlerPerfLimits = {
  /** 500 formatted ZodError responses total wall time (after warmup). */
  batchFormatMs: isCiRunner ? 1_400 : 400,
} as const;
