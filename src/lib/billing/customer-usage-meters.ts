/**
 * Canonical usage meter ids for customer billing (overage, usage-based SKUs).
 * Align `meterKey` in feature-flag catalog entries where applicable.
 * Recording: `recordCustomerUsageMeterEvent` in `./record-customer-usage-meter`.
 */

export interface CustomerUsageMeterDefinition {
  /** Stable id — use in Stripe meter metadata / idempotency keys. */
  id: string;
  displayName: string;
  description: string;
  /** Default unit label for ledger rows. */
  defaultUnit: string;
}

export const CUSTOMER_USAGE_METERS: readonly CustomerUsageMeterDefinition[] = [
  {
    id: "fitscore_hybrid_run",
    displayName: "Hybrid FitScore run",
    description: "One scored candidate–job pair via hybrid v2 pipeline (API / batch path).",
    defaultUnit: "run",
  },
  {
    id: "agent_scout_invocation",
    displayName: "Scout agent invocation",
    description: "Scout / CV intake agent handling one logical invocation.",
    defaultUnit: "invocation",
  },
  {
    id: "agent_vouch_invocation",
    displayName: "Vouch agent invocation",
    description: "Vouch agent handling one logical invocation.",
    defaultUnit: "invocation",
  },
  {
    id: "agent_verify_invocation",
    displayName: "Verify agent invocation",
    description: "Verify agent handling one logical invocation.",
    defaultUnit: "invocation",
  },
  {
    id: "agent_scheduler_invocation",
    displayName: "Scheduler agent invocation",
    description: "Scheduler agent automation touch.",
    defaultUnit: "invocation",
  },
  {
    id: "agent_ghostbuster_llm_invocation",
    displayName: "Ghostbuster authenticity (LLM) invocation",
    description: "LLM authenticity analysis for one candidate.",
    defaultUnit: "invocation",
  },
  {
    id: "ack_notification_sent",
    displayName: "Acknowledgement notification",
    description: "Candidate acknowledgement attempt (email or WhatsApp channel).",
    defaultUnit: "notification",
  },
  {
    id: "ack_email_sent",
    displayName: "Acknowledgement email",
    description: "Email acknowledgement message.",
    defaultUnit: "email",
  },
  {
    id: "ack_whatsapp_sent",
    displayName: "Acknowledgement WhatsApp",
    description: "WhatsApp acknowledgement message.",
    defaultUnit: "message",
  },
  {
    id: "ai_summary_generated",
    displayName: "AI summary generated",
    description: "Claude summary generated for candidate card or similar surface.",
    defaultUnit: "summary",
  },
  {
    id: "voice_screening_session",
    displayName: "Voice screening session",
    description:
      "Outbound voice screening session (e.g. Bolna); not gated by a runtime feature_flag — record at call completion.",
    defaultUnit: "session",
  },
] as const;

const METER_BY_ID = new Map(CUSTOMER_USAGE_METERS.map((m) => [m.id, m]));

export function getCustomerUsageMeterDefinition(
  meterId: string,
): CustomerUsageMeterDefinition | undefined {
  return METER_BY_ID.get(meterId);
}

export function listCustomerUsageMeters(): readonly CustomerUsageMeterDefinition[] {
  return CUSTOMER_USAGE_METERS;
}
