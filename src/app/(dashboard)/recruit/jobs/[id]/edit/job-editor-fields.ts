import type { JobReferralBonusDefaults } from "@/components/dashboard/JobReferralBonusFormFields";
export function countWords(s: string | null | undefined): number {
  if (!s || typeof s !== "string") return 0;
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function referralRowToDefaults(
  row: Record<string, unknown> | null,
): JobReferralBonusDefaults {
  if (!row) return null;
  const t = row.bonus_trigger;
  const bonus_trigger = t === "shortlisted" || t === "day_90" ? t : "offer_accepted";
  return {
    direct_bonus_amount: Number(row.direct_bonus_amount ?? 0),
    parent_bonus_amount: Number(row.parent_bonus_amount ?? 0),
    candidate_referrer_bonus_amount: Number(row.candidate_referrer_bonus_amount ?? 0),
    vouch_bonus_amount: Number(row.vouch_bonus_amount ?? 0),
    bonus_trigger,
    candidate_referrer_enabled: Boolean(row.candidate_referrer_enabled),
    bonus_notes: typeof row.bonus_notes === "string" ? row.bonus_notes : null,
  };
}

export const inputClass =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-white/30 focus:border-[var(--accent)] focus:outline-none";
export const labelClass =
  "mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40";
