import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentName } from "@/lib/agents/types";
import { logger } from "./logger";
import { sendCostAlert } from "./alerts";

const COST = {
  claude_sonnet_input_per_1k: 0.003,
  claude_sonnet_output_per_1k: 0.015,
  claude_opus_input_per_1k: 0.005,
  claude_opus_output_per_1k: 0.025,
  claude_haiku_input_per_1k: 0.001,
  claude_haiku_output_per_1k: 0.005,
  openai_embedding_per_1k: 0.00002,
  usd_to_inr: 84,
} as const;

export function calculateClaudeCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const isHaiku = model.includes("haiku");
  const isOpus = model.includes("opus");
  const inputRate = isHaiku
    ? COST.claude_haiku_input_per_1k
    : isOpus
      ? COST.claude_opus_input_per_1k
      : COST.claude_sonnet_input_per_1k;
  const outputRate = isHaiku
    ? COST.claude_haiku_output_per_1k
    : isOpus
      ? COST.claude_opus_output_per_1k
      : COST.claude_sonnet_output_per_1k;
  const usd = (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
  return parseFloat((usd * COST.usd_to_inr).toFixed(4));
}

export function calculateEmbeddingCost(tokens: number): number {
  const usd = (tokens / 1000) * COST.openai_embedding_per_1k;
  return parseFloat((usd * COST.usd_to_inr).toFixed(4));
}

export async function logAgentRun(
  supabase: SupabaseClient,
  agent: AgentName,
  trigger: string,
  refId: string | null,
  status: "success" | "error",
  durationMs: number,
  error?: string,
  tokens?: { input: number; output: number },
  model?: string,
): Promise<void> {
  const cost = tokens && model ? calculateClaudeCost(model, tokens.input, tokens.output) : 0;

  const totalTokens = (tokens?.input ?? 0) + (tokens?.output ?? 0);

  await supabase.from("agent_logs").insert({
    agent_name: agent,
    trigger_type: trigger,
    input_ref: refId,
    status,
    tokens_used: totalTokens,
    cost_inr: cost,
    duration_ms: durationMs,
    error_message: error ?? null,
  });

  logger.agent(agent, {
    duration_ms: durationMs,
    cost_inr: cost,
    tokens_used: totalTokens,
    error: error ?? undefined,
  });

  if (cost > 50) {
    await sendCostAlert(agent, cost, refId);
  }
}
