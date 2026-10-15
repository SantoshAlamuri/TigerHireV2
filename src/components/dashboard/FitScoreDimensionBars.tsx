"use client";

import type { FitScore } from "@/types";
import { V2_CRITERIA_KEYS } from "@/lib/fitscore/types";
import { DimensionBar } from "./DimensionBar";

/** Letter grade → display % for criterion bars (aligned with three-stage GRADE_POINTS). */
const CRITERIA_GRADE_PCT: Record<string, number> = { A: 100, B: 75, C: 50, D: 25, E: 0 };

function criteriaBreakdownBarPercent(c: {
  grade?: string;
  points_earned: number;
  weight: number;
}): number {
  const w = c.weight;
  const p = c.points_earned;
  const fromPoints = w > 0 ? Math.round((p / w) * 100) : 0;
  const fromGrade = CRITERIA_GRADE_PCT[String(c.grade ?? "E").toUpperCase()] ?? 0;
  if (fromPoints > 0) return fromPoints;
  if (fromGrade > 0) return fromGrade;
  return 0;
}

const V1_DIMENSION_KEYS = [
  "skillsMatch",
  "experienceRelevance",
  "seniorityAlignment",
  "locationAvailability",
  "signalFreshness",
] as const;

/**
 * Shared dimension / criterion bars used by {@link FitScoreCard} and {@link FitScoreReasoningPanel}.
 * Prefers `criteriaBreakdown` when present; otherwise maps hybrid / legacy `dimensions`.
 */
export function FitScoreDimensionBars({
  score,
  className = "",
  /** When set, wraps bars in a framed section (verdict panel). Omit on FitScoreCard. */
  sectionTitle,
  /** Page has a dedicated Logistics tab — suppress the logistics context block here. */
  hideLogistics = false,
}: {
  score: FitScore;
  /** e.g. `mt-6` on FitScoreCard */
  className?: string;
  sectionTitle?: string;
  hideLogistics?: boolean;
}) {
  const breakdown = score.criteriaBreakdown;

  // Logistics (location/availability/notice) answers "can we hire them", not "how good a fit".
  // The engine never scores logistics — it only ever appears in display-layer criteria — so
  // render those rows in a separate, de-emphasised context block instead of amid the quality bars.
  const logisticsRe = /location|relocation|notice|availab/i;

  type BarRow = { key: string; label: string; value: number; reasoning?: string };
  let quality: BarRow[] = [];
  let logistics: BarRow[] = [];

  if (breakdown && breakdown.length > 0) {
    for (const c of breakdown) {
      const row: BarRow = {
        key: c.criterion_id,
        label: `${c.criterion_name} (${c.weight}%)`,
        value: criteriaBreakdownBarPercent({
          grade: c.grade,
          points_earned: c.points_earned,
          weight: c.weight,
        }),
        reasoning: c.evidence_text || undefined,
      };
      if (logisticsRe.test(`${c.criterion_id ?? ""} ${c.criterion_name ?? ""}`)) {
        logistics.push(row);
      } else {
        quality.push(row);
      }
    }
  } else {
    const dims = score.dimensions;
    const isFixedV2 = V2_CRITERIA_KEYS.some((k) => dims[k] != null);
    let keys: string[];
    if (isFixedV2) {
      keys = [...V2_CRITERIA_KEYS].filter((k) => dims[k] != null);
    } else if ((score.scoringVersion ?? 0) >= 2) {
      keys = Object.keys(dims).filter((k) => k !== "_meta" && dims[k] != null);
      keys.sort((a, b) => (dims[b]?.weight ?? 0) - (dims[a]?.weight ?? 0));
    } else {
      keys = [...V1_DIMENSION_KEYS].filter((k) => dims[k] != null);
    }
    for (const key of keys) {
      const d = dims[key];
      const weightPct = d?.weight != null && d.weight > 0 ? Math.round(d.weight * 100) : null;
      const row: BarRow = {
        key,
        label: weightPct != null ? `${d!.label} (${weightPct}%)` : d!.label,
        value: d!.score,
        reasoning: d?.reasoning,
      };
      if (logisticsRe.test(`${key} ${d?.label ?? ""}`)) {
        logistics.push(row);
      } else {
        quality.push(row);
      }
    }
  }

  // Never let the section render empty because everything matched the logistics filter.
  if (quality.length === 0 && logistics.length > 0) {
    quality = logistics;
    logistics = [];
  }
  if (quality.length === 0) return null;

  const renderRows = (rows: BarRow[]) => (
    <div className="grid gap-x-10 gap-y-3.5 xl:grid-cols-2">
      {rows.map((r) => (
        <DimensionBar key={r.key} label={r.label} value={r.value} reasoning={r.reasoning} />
      ))}
    </div>
  );

  const logisticsBlock =
    !hideLogistics && logistics.length > 0 ? (
      <div className="mt-4 rounded-xl border border-[var(--border)]/60 bg-white/[0.015] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
          Logistics — context, not skill fit
        </p>
        <p className="mb-3 mt-1 text-[11px] leading-snug text-[var(--text-subtle)]">
          Answers “can you hire them” (location, availability, notice); it does not measure how good
          the candidate is.
        </p>
        {renderRows(logistics)}
      </div>
    ) : null;

  if (sectionTitle) {
    return (
      <div
        className={`rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]/25 p-4 ring-1 ring-inset ring-white/[0.04] md:p-5 ${className}`.trim()}
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
          {sectionTitle}
        </p>
        <div className="mt-4">{renderRows(quality)}</div>
        {logisticsBlock}
      </div>
    );
  }

  return (
    <div className={["space-y-3", className].filter(Boolean).join(" ").trim()}>
      {renderRows(quality)}
      {logisticsBlock}
    </div>
  );
}
