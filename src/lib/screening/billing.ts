import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_VOICE_PRICE_INR = 99;
export const DEFAULT_FREE_VOICE_CREDITS = 10;

export function calculateVoiceChargeInr(args: {
  completedCallsThisMonthBeforeCurrent: number;
  freeCreditsPerMonth: number;
  unitPriceInr?: number;
}): number {
  const unitPriceInr = Math.max(0, args.unitPriceInr ?? DEFAULT_VOICE_PRICE_INR);
  const freeCredits = Math.max(0, Math.floor(args.freeCreditsPerMonth));
  const completedBefore = Math.max(0, Math.floor(args.completedCallsThisMonthBeforeCurrent));
  return completedBefore < freeCredits ? 0 : unitPriceInr;
}

function monthStartUtcIso(referenceDate: Date): string {
  const start = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1, 0, 0, 0),
  );
  return start.toISOString();
}

export async function resolveVoiceChargeInrAtCompletion(
  supabase: SupabaseClient,
  args: {
    organisationId: string;
    completedAtIso: string;
    freeCreditsPerMonth?: number | null;
    unitPriceInr?: number;
  },
): Promise<number> {
  const completedAt = new Date(args.completedAtIso);
  const monthStartIso = monthStartUtcIso(completedAt);
  const { count, error } = await supabase
    .from("screening_jobs")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", args.organisationId)
    .eq("mode", "voice")
    .eq("status", "completed")
    .gte("ended_at", monthStartIso)
    .lt("ended_at", args.completedAtIso);
  if (error) throw error;
  return calculateVoiceChargeInr({
    completedCallsThisMonthBeforeCurrent: count ?? 0,
    freeCreditsPerMonth: args.freeCreditsPerMonth ?? DEFAULT_FREE_VOICE_CREDITS,
    unitPriceInr: args.unitPriceInr,
  });
}
