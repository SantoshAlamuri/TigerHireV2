import { recordPlatformCostEvent } from "@/lib/costs/ledger";
import { logger } from "@/lib/observability/logger";
import { getCustomerUsageMeterDefinition } from "@/lib/billing/customer-usage-meters";

export interface RecordCustomerUsageMeterInput {
  organisationId: string;
  meterKey: string;
  quantity: number;
  unit?: string;
  /** Unique per logical event (e.g. application_id + attempt, or call_sid). */
  idempotencyKey: string;
  jobId?: string;
  candidateId?: string;
  occurredAt?: string;
  /** Optional USD line for internal estimates; Stripe meter sync can ignore or map separately. */
  amountUsd?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Idempotent customer usage unit — upserts into `platform_cost_events` with provider `tigerhire`.
 * Use for usage-based billing rollups and future Stripe meter event emission.
 */
export async function recordCustomerUsageMeterEvent(
  input: RecordCustomerUsageMeterInput,
): Promise<{ ok: true; externalId: string } | { ok: false; error: string }> {
  const meter = getCustomerUsageMeterDefinition(input.meterKey);
  if (!meter) {
    logger.warn("recordCustomerUsageMeterEvent: unknown meter key", { meterKey: input.meterKey });
    return { ok: false, error: `Unknown meter key: ${input.meterKey}` };
  }

  const safeOrg = input.organisationId.trim();
  const safeKey = input.idempotencyKey.trim().slice(0, 400);
  if (!safeOrg || !safeKey) {
    return { ok: false, error: "organisationId and idempotencyKey are required" };
  }

  const externalId = `tigerhire:meter:${safeOrg}:${input.meterKey}:${safeKey}`.slice(0, 900);

  const { error } = await recordPlatformCostEvent({
    provider: "tigerhire",
    service: "customer_usage_meter",
    category: "customer_usage",
    externalId,
    organisationId: safeOrg,
    jobId: input.jobId,
    candidateId: input.candidateId,
    occurredAt: input.occurredAt,
    quantity: Math.max(0, input.quantity),
    unit: input.unit ?? meter.defaultUnit,
    amountUsd: input.amountUsd ?? 0,
    status: "estimated",
    metadata: {
      meter_id: meter.id,
      meter_display_name: meter.displayName,
      ...input.metadata,
    },
  });

  if (error) {
    const msg =
      error instanceof Error
        ? error.message
        : typeof error === "object" &&
            error !== null &&
            "message" in error &&
            typeof (error as { message?: unknown }).message === "string"
          ? (error as { message: string }).message
          : String(error);
    return { ok: false, error: msg };
  }

  return { ok: true, externalId };
}
