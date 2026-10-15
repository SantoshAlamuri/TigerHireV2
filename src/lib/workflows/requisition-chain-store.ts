import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/observability/logger";
import type { ChainDef } from "./requisition-chain";

/**
 * Loads an organisation's own approval policy, when it has authored one.
 *
 * Returns null rather than a default, deliberately. An org that has not
 * authored a chain keeps the preset it is already running on — inventing a
 * default here would silently change who approves their requisitions, which is
 * the one thing an approval control must never do quietly.
 */
export async function loadDefaultChain(
  admin: SupabaseClient,
  organisationId: string,
): Promise<ChainDef | null> {
  const { data: chain, error } = await admin
    .from("requisition_approval_chains")
    .select("id, name")
    .eq("organisation_id", organisationId)
    .eq("is_default", true)
    .maybeSingle();

  if (error) {
    // Degraded, not fatal: the preset path still produces a valid chain. Warned
    // distinctly so "the org's policy was ignored" is traceable rather than
    // looking like the policy never existed.
    logger.warn("requisition chain lookup failed; falling back to the preset chain", {
      organisationId,
      error: error.message,
    });
    return null;
  }
  if (!chain?.id) return null;

  const { data: steps, error: stepsError } = await admin
    .from("requisition_approval_chain_steps")
    .select("step_order, approver_role, sla_hours, skip_when_raiser_role, skip_when_budget_below")
    .eq("chain_id", chain.id as string)
    .order("step_order", { ascending: true });

  if (stepsError) {
    logger.warn("requisition chain steps failed to load; falling back to the preset chain", {
      organisationId,
      chainId: chain.id,
      error: stepsError.message,
    });
    return null;
  }

  // A chain row with no steps is a policy of "approve on sight". That is a
  // legitimate choice, but it must be one somebody made — an empty chain here
  // is far more likely to be a half-finished edit, so the preset stands.
  if (!steps || steps.length === 0) {
    logger.warn("requisition chain has no steps; falling back to the preset chain", {
      organisationId,
      chainId: chain.id,
    });
    return null;
  }

  return {
    id: chain.id as string,
    name: (chain.name as string) ?? "Approval chain",
    steps: steps.map((s) => ({
      stepOrder: Number(s.step_order),
      approverRole: String(s.approver_role),
      slaHours: Number(s.sla_hours ?? 8),
      skipWhenRaiserRole: (s.skip_when_raiser_role as string[] | null) ?? [],
      skipWhenBudgetBelow:
        s.skip_when_budget_below == null ? null : Number(s.skip_when_budget_below),
    })),
  };
}
