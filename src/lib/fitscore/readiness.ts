/**
 * Readiness ("Logistics") score — the fourth candidate signal alongside
 * FitScore (quality), ICP Match, and Market rank.
 *
 * Answers "can you actually hire them, and how soon" from fields recruiters
 * already capture on the application. Fully DETERMINISTIC — no model calls —
 * and honest about coverage: unknown fields are skipped, and the result
 * reports how many signals it is based on. Readiness must never blend into
 * the quality score or verdict (ICP spec §4: logistics gates/annotates, it
 * does not add points).
 */

export interface ReadinessInput {
  noticePeriodDays: number | null | undefined;
  availableFrom: string | null | undefined;
  relocationWillingness: "yes" | "no" | "negotiable" | null | undefined;
  offersInHand: number | null | undefined;
  hasCv: boolean;
  screeningCompleted: boolean;
}

export interface ReadinessPart {
  key: string;
  label: string;
  /** 0–100 contribution, or null when the signal is unknown. */
  value: number | null;
  detail: string;
}

export interface ReadinessResult {
  /** 0–100 average over known signals; null when nothing is known. */
  score: number | null;
  band: "Ready now" | "Ready soon" | "Long lead" | "Unknown";
  knownSignals: number;
  totalSignals: number;
  parts: ReadinessPart[];
}

function noticeScore(days: number): { value: number; detail: string } {
  if (days <= 15) return { value: 100, detail: `${days}d notice — immediate` };
  if (days <= 30) return { value: 80, detail: `${days}d notice` };
  if (days <= 60) return { value: 55, detail: `${days}d notice` };
  return { value: 30, detail: `${days}d notice — long lead` };
}

function availabilityScore(availableFrom: string): { value: number; detail: string } | null {
  const ms = Date.parse(availableFrom);
  if (Number.isNaN(ms)) return null;
  const days = Math.ceil((ms - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 14) return { value: 100, detail: "available within 2 weeks" };
  if (days <= 45) return { value: 70, detail: `available in ~${Math.round(days / 7)} weeks` };
  return { value: 40, detail: `available in ${Math.round(days / 30)}+ months` };
}

export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const parts: ReadinessPart[] = [];

  const notice =
    input.noticePeriodDays != null && Number.isFinite(input.noticePeriodDays)
      ? noticeScore(input.noticePeriodDays)
      : null;
  parts.push({
    key: "notice",
    label: "Notice period",
    value: notice?.value ?? null,
    detail: notice?.detail ?? "not captured",
  });

  const avail = input.availableFrom ? availabilityScore(input.availableFrom) : null;
  parts.push({
    key: "availability",
    label: "Available from",
    value: avail?.value ?? null,
    detail: avail?.detail ?? "not captured",
  });

  const reloc = input.relocationWillingness;
  parts.push({
    key: "relocation",
    label: "Relocation",
    value: reloc === "yes" ? 100 : reloc === "negotiable" ? 70 : reloc === "no" ? 35 : null,
    detail: reloc ? `relocation: ${reloc}` : "not captured",
  });

  const offers =
    input.offersInHand != null && Number.isFinite(input.offersInHand) ? input.offersInHand : null;
  parts.push({
    key: "offers",
    label: "Competing offers",
    // 0 offers is neutral (not a readiness boost); offers raise counteroffer risk.
    value: offers == null ? null : offers === 0 ? 75 : offers <= 2 ? 55 : 40,
    detail:
      offers == null
        ? "not captured"
        : offers === 0
          ? "no competing offers"
          : `${offers} offer${offers === 1 ? "" : "s"} in hand — counteroffer risk`,
  });

  parts.push({
    key: "cv",
    label: "CV on file",
    value: input.hasCv ? 100 : 30,
    detail: input.hasCv ? "CV available" : "no CV yet",
  });

  parts.push({
    key: "screening",
    label: "Screening",
    value: input.screeningCompleted ? 100 : 50,
    detail: input.screeningCompleted ? "screening completed" : "screening pending",
  });

  // Realism guards:
  // 1. CV/screening are PROCESS states that are always known — without at least one real
  //    logistics signal (notice / availability / relocation / offers) they would fabricate a
  //    precise-looking score from nothing. Core signals gate the score.
  // 2. Signals are weighted by how much they actually govern hireability, not flat-averaged.
  const WEIGHTS: Record<string, number> = {
    notice: 0.35,
    availability: 0.25,
    relocation: 0.15,
    offers: 0.1,
    cv: 0.1,
    screening: 0.05,
  };
  const CORE_KEYS = new Set(["notice", "availability", "relocation", "offers"]);

  const known = parts.filter((p) => p.value != null);
  const hasCoreSignal = known.some((p) => CORE_KEYS.has(p.key));

  let score: number | null = null;
  if (hasCoreSignal) {
    let weighted = 0;
    let weightSum = 0;
    for (const part of known) {
      const w = WEIGHTS[part.key] ?? 0;
      weighted += (part.value as number) * w;
      weightSum += w;
    }
    score = weightSum > 0 ? Math.round(weighted / weightSum) : null;
  }

  const band: ReadinessResult["band"] =
    score == null
      ? "Unknown"
      : score >= 75
        ? "Ready now"
        : score >= 50
          ? "Ready soon"
          : "Long lead";

  return { score, band, knownSignals: known.length, totalSignals: parts.length, parts };
}
