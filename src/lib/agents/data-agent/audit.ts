/**
 * Read-only hiring-data agent (v1) — per-turn audit logger.
 *
 * Writes one row to agent_query_log per question. Uses the recruiter's
 * user-JWT client so the table's org-scoped INSERT policy authorises the
 * write — there is no service-role path here. Best-effort: a logging failure
 * is recorded but never blocks the answer returned to the user.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";

export interface AgentQueryLogEntry {
  organisationId: string;
  userId: string;
  question: string;
  tool: string;
  args: Record<string, unknown> | null;
  rowCount: number | null;
  latencyMs: number;
}

export async function logAgentQuery(
  supabase: SupabaseClient,
  entry: AgentQueryLogEntry,
): Promise<void> {
  try {
    const { error } = await supabase.from("agent_query_log").insert({
      organisation_id: entry.organisationId,
      user_id: entry.userId,
      question: entry.question,
      tool: entry.tool,
      args: entry.args,
      row_count: entry.rowCount,
      latency_ms: entry.latencyMs,
    });
    if (error) {
      logger.warn("[data-agent] audit log insert failed", { error: error.message });
    }
  } catch (err) {
    logger.warn("[data-agent] audit log threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
