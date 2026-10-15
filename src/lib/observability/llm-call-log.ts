import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { calculateAnthropicUsdCost } from "@/lib/costs/ledger";
import { getCorrelationId } from "@/lib/observability/correlation";
import { logger } from "@/lib/observability/logger";

type LlmCallStatus = "ok" | "error" | "circuit_open" | "timeout";

interface LlmCallLogInput {
  model: string;
  purpose: string;
  latencyMs: number;
  status: LlmCallStatus;
  inputTokens?: number;
  outputTokens?: number;
  organisationId?: string | null;
  errorClass?: string | null;
}

/**
 * Fire-and-forget LLM call observability log. Must never block user flows.
 */
export function logLlmCall(input: LlmCallLogInput): void {
  const requestId = getCorrelationId() ?? null;
  const inputTokens = input.inputTokens ?? null;
  const outputTokens = input.outputTokens ?? null;
  const costUsd =
    inputTokens != null && outputTokens != null
      ? calculateAnthropicUsdCost(input.model, inputTokens, outputTokens)
      : null;

  void (async () => {
    try {
      const admin = createSupabaseAdmin();
      await admin.from("llm_call_logs").insert({
        request_id: requestId,
        organisation_id: input.organisationId ?? null,
        model: input.model,
        purpose: input.purpose,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: Math.max(0, Math.round(input.latencyMs)),
        status: input.status,
        error_class: input.errorClass ?? null,
        cost_usd: costUsd,
      });
    } catch (error) {
      logger.warn("Failed to persist llm_call_logs row", {
        model: input.model,
        purpose: input.purpose,
        status: input.status,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  })();
}
