"use client";

import { useId, useState } from "react";

export type JobReferralBonusDefaults = {
  direct_bonus_amount: number;
  parent_bonus_amount: number;
  candidate_referrer_bonus_amount: number;
  vouch_bonus_amount: number;
  bonus_trigger: "shortlisted" | "offer_accepted" | "day_90";
  candidate_referrer_enabled: boolean;
  bonus_notes: string | null;
} | null;

type Props = {
  /** When true, referral program fields are active and other inputs are enabled. */
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  defaults: JobReferralBonusDefaults;
  /** Retained for compatibility; the enable toggle now controls disclosure. */
  startOpen?: boolean;
};

/**
 * The four configurable bonuses — and which of them the payout engine can
 * actually pay.
 *
 * The candidate-as-referrer rate is now paid: payout-trigger picks the direct
 * referrer's rate by who they are — employee, candidate in the pipeline, or
 * anyone else. See resolveDirectReferrerAmount.
 *
 * The vouch bonus is still stored and never paid. It needs a vouch record to
 * attach to, which does not exist yet, so it stays labelled rather than
 * silently implying a payout that never fires.
 */
export const BONUS_FIELDS = [
  {
    name: "ref_direct_bonus",
    label: "Direct referrer",
    hint: "The person who referred them",
    live: true,
  },
  {
    name: "ref_parent_bonus",
    label: "Parent referrer",
    hint: "Who referred the referrer",
    live: true,
  },
  {
    name: "ref_candidate_bonus",
    label: "Candidate refers someone",
    hint: "A candidate already in your pipeline refers another person",
    live: true,
  },
  {
    name: "ref_vouch_bonus",
    label: "Vouch",
    hint: "An employee vouches for someone — saved, no payout runs on this yet",
    live: false,
  },
] as const;

/**
 * Which milestone releases the payout.
 *
 * `live` marks the ones that can actually fire. Shortlisted and offer-accepted
 * come from application status changes. Day 90 cannot — no status change means
 * "still employed ninety days later" — so it runs off a nightly sweep counting
 * from `pipeline_candidates.joined_at`, the recruiter-recorded first day.
 *
 * It is anchored on the joining date and not on `hired_at` deliberately.
 * `hired_at` is when the hire was *marked*, which lands weeks early and
 * sometimes for someone who never starts; paying a retention bonus to a
 * referrer for a candidate who never turned up is the failure this avoids.
 *
 * The sub-label names that dependency because it is the one way this milestone
 * stalls: no joining date recorded, no payout. The sweep reports those hires
 * every run rather than letting them go quiet again.
 */
const MILESTONES = [
  { value: "shortlisted", label: "Shortlisted", sub: "earliest, highest risk", live: true },
  { value: "offer_accepted", label: "Offer accepted", sub: "most common", live: true },
  {
    value: "day_90",
    label: "Day 90",
    sub: "90 days after the recorded joining date",
    live: true,
  },
] as const;

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Referral payouts for a job.
 *
 * Restyled rather than shrunk. What was wrong was not the size:
 *
 *  · A raw <details> triangle and native checkboxes read as an unfinished form.
 *  · Four bare number inputs never showed the number that actually matters —
 *    the TOTAL a single referred hire can cost. A recruiter setting 15k + 5k +
 *    8k had to add it up themselves to see they had committed ₹28,000.
 *  · The milestone is three choices; a dropdown hid two of them, and the
 *    trade-off between them (pay early and risk it, pay late and lose goodwill)
 *    was invisible.
 *  · Amounts stayed editable while payouts were switched off, which invites
 *    filling in a form that does nothing.
 */
export function JobReferralBonusFormFields({ enabled, onEnabledChange, defaults }: Props) {
  const uid = useId();
  const d = defaults;

  const [amounts, setAmounts] = useState<Record<string, number>>({
    ref_direct_bonus: d?.direct_bonus_amount ?? 15000,
    ref_parent_bonus: d?.parent_bonus_amount ?? 5000,
    ref_candidate_bonus: d?.candidate_referrer_bonus_amount ?? 8000,
    ref_vouch_bonus: d?.vouch_bonus_amount ?? 0,
  });
  // Only the bonuses the payout engine actually pays. Summing the inert ones
  // would overstate the commitment and lend them credibility they have not
  // earned — the whole reason for showing a total is that it is trustworthy.
  const total = BONUS_FIELDS.filter((f) => f.live).reduce((n, f) => n + (amounts[f.name] ?? 0), 0);
  const configuredOnly = BONUS_FIELDS.filter((f) => !f.live).reduce(
    (n, f) => n + (amounts[f.name] ?? 0),
    0,
  );

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/30">
      {/* The toggle IS the disclosure: one control, not a triangle plus a box. */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onEnabledChange(!enabled)}
          className={`relative h-5 w-9 shrink-0 rounded-full transition ${
            enabled ? "bg-[var(--accent)]" : "bg-white/15"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-black/80 transition-all ${
              enabled ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-[var(--text)]">
            Referral bonuses
          </span>
          <span className="block text-[11px] text-white/40">
            {enabled
              ? "Paid when the milestone below fires"
              : "Off — no payouts are created for this job"}
          </span>
        </span>
        {enabled ? (
          // The figure a recruiter is actually approving, which four separate
          // inputs never showed.
          <span className="text-right">
            <span className="block text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
              Pays out, per hire
            </span>
            <span className="block font-mono text-lg font-semibold tabular-nums text-[var(--accent)]">
              {money(total)}
            </span>
            {configuredOnly > 0 ? (
              <span className="block text-[10px] text-white/30">
                +{money(configuredOnly)} configured, not paid
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {enabled ? (
        <div className="space-y-4 border-t border-[var(--border)] px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {BONUS_FIELDS.map((f) => (
              <div key={f.name}>
                <label
                  htmlFor={`${uid}-${f.name}`}
                  className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40"
                >
                  {f.label}
                </label>
                <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 focus-within:border-[var(--accent)]">
                  <span className="pl-2.5 text-[13px] text-white/30">₹</span>
                  <input
                    id={`${uid}-${f.name}`}
                    name={f.name}
                    type="number"
                    min={0}
                    step={1000}
                    value={amounts[f.name]}
                    onChange={(e) =>
                      setAmounts((a) => ({ ...a, [f.name]: Number(e.target.value) || 0 }))
                    }
                    className="w-full bg-transparent px-2 py-2 text-right font-mono text-[13px] tabular-nums text-[var(--text)] outline-none"
                  />
                </div>
                <p
                  className={`mt-0.5 text-[10.5px] ${f.live ? "text-white/30" : "text-amber-300/50"}`}
                >
                  {f.hint}
                  {f.live ? "" : " · no payout runs on this yet"}
                </p>
              </div>
            ))}
          </div>

          <div>
            <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">
              Pays out when
            </span>
            {/* Three options, so all three are shown with their trade-off. A
                select hid two of them and the reason to prefer one. */}
            <div className="flex flex-wrap gap-2">
              {MILESTONES.map((m) => (
                <label
                  key={m.value}
                  title={
                    m.live
                      ? undefined
                      : "No payout runs on this yet — it needs a scheduled job and a recorded joining date."
                  }
                  className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center transition has-[:checked]:bg-[var(--accent)]/10 ${
                    m.live
                      ? "border-[var(--border)] has-[:checked]:border-[var(--accent)]"
                      : "border-amber-400/25 has-[:checked]:border-amber-400/60"
                  }`}
                >
                  <input
                    type="radio"
                    name="ref_bonus_trigger"
                    value={m.value}
                    defaultChecked={(d?.bonus_trigger ?? "offer_accepted") === m.value}
                    className="sr-only"
                  />
                  <span className="block text-[12.5px] font-semibold text-[var(--text)]">
                    {m.label}
                  </span>
                  <span
                    className={`block text-[10px] ${m.live ? "text-white/35" : "text-amber-300/60"}`}
                  >
                    {m.sub}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-white/70">
            <input
              type="checkbox"
              name="ref_candidate_referrer_enabled"
              defaultChecked={d?.candidate_referrer_enabled ?? false}
              className="h-3.5 w-3.5 rounded border-[var(--border)]"
            />
            Let candidates already in this pipeline refer other people
            <span className="text-[11px] text-white/30">— they earn the rate above</span>
          </label>

          <div>
            <label
              htmlFor={`${uid}-notes`}
              className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40"
            >
              Notes (optional)
            </label>
            <input
              id={`${uid}-notes`}
              name="ref_bonus_notes"
              placeholder="e.g. Paid after finance confirmation"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2 text-[13px] text-[var(--text)] placeholder:text-white/25 focus:border-[var(--accent)] focus:outline-none"
              defaultValue={d?.bonus_notes ?? ""}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function buildReferralConfigPayload(
  form: FormData,
  referralEnabled: boolean,
): {
  enabled: boolean;
  direct_bonus_amount: number;
  parent_bonus_amount: number;
  candidate_referrer_bonus_amount: number;
  vouch_bonus_amount: number;
  bonus_trigger: "shortlisted" | "offer_accepted" | "day_90";
  candidate_referrer_enabled: boolean;
  bonus_notes: string | null;
} {
  const enabled = referralEnabled;
  const direct = Number(form.get("ref_direct_bonus")) || 0;
  const parent = Number(form.get("ref_parent_bonus")) || 0;
  const cand = Number(form.get("ref_candidate_bonus")) || 0;
  const vouch = Number(form.get("ref_vouch_bonus")) || 0;
  const triggerRaw = form.get("ref_bonus_trigger") as string;
  const bonus_trigger =
    triggerRaw === "shortlisted" || triggerRaw === "day_90" ? triggerRaw : "offer_accepted";
  const candidate_referrer_enabled = form.get("ref_candidate_referrer_enabled") === "on";
  const notes = (form.get("ref_bonus_notes") as string)?.trim() || null;
  return {
    enabled,
    direct_bonus_amount: direct,
    parent_bonus_amount: parent,
    candidate_referrer_bonus_amount: cand,
    vouch_bonus_amount: vouch,
    bonus_trigger,
    candidate_referrer_enabled,
    bonus_notes: notes,
  };
}
