"use client";

import Link from "next/link";
import { STATUS, type StatusKey, barWidth, sparkPath, ORDINAL } from "@/lib/v2/viz";
export { SectionLabel, Insight } from "./Labels";

/**
 * The visual language of the analytics screens.
 *
 * Built to the data-viz method rather than to taste: the form is chosen by the
 * data's job (a single headline number is a hero figure, not a one-bar chart),
 * colour comes from the validated palette in lib/v2/viz, marks are thin with
 * rounded data-ends anchored to the baseline, grid and axes stay recessive, and
 * every mark carries a hover tooltip. Text keeps text tokens — a coloured mark
 * beside a label carries identity, so nothing depends on colour alone.
 */
function Delta({ value }: { value: number | null }) {
  if (value === null) return null;
  const up = value > 0;
  return (
    <span
      className="ml-2 align-middle text-[11px] font-semibold"
      style={{ color: up ? STATUS.good : value < 0 ? STATUS.critical : undefined }}
    >
      {up ? "▲" : value < 0 ? "▼" : "="} {Math.abs(value)}%
    </span>
  );
}

/**
 * The one number a view leads with. Large enough to be read across a room,
 * because that is what a headline figure is for.
 */
export function HeroFigure({
  label,
  value,
  unit,
  note,
  deltaPct = null,
  spark,
  verdict = "unknown",
  href,
  target,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  note?: string;
  deltaPct?: number | null;
  spark?: number[];
  verdict?: "good" | "warn" | "bad" | "unknown";
  /** Where the rows behind this number live. Omitted when there is no list. */
  href?: string;
  /** The target, shown in the corner and tinted by whether we cleared it. */
  target?: string | null;
}) {
  const missing = value === null;
  // Colour states the verdict against the target; the target's value is in the
  // badge beside it, so colour is never the only evidence.
  const ink =
    missing || verdict === "unknown"
      ? undefined
      : verdict === "good"
        ? STATUS.good
        : verdict === "bad"
          ? STATUS.critical
          : STATUS.warning;
  const path = spark && spark.length > 1 ? sparkPath(spark) : "";
  const body = (
    <>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          {label}
        </span>
        {href ? (
          <span aria-hidden className="text-[10px] text-white/20 group-hover:text-[var(--accent)]">
            →
          </span>
        ) : null}
        {target ? (
          // Green once we are past the target, red once we are behind it. The
          // word "target" stays in the badge so the colour is never the only
          // thing carrying the meaning.
          <span
            className="ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold"
            style={{
              background: ink ? `${ink}1f` : "rgba(255,255,255,0.05)",
              color: ink ?? "rgba(255,255,255,0.35)",
            }}
          >
            {target}
          </span>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div
          className={`font-mono text-[46px] font-semibold leading-[0.9] tabular-nums ${
            missing ? "text-white/15" : ink ? "" : "text-[var(--text)]"
          }`}
          style={ink ? { color: ink } : undefined}
        >
          {missing ? "—" : value}
          {!missing && unit ? (
            <span className="ml-1 text-[14px] font-medium text-white/30">{unit}</span>
          ) : null}
          {!missing ? <Delta value={deltaPct} /> : null}
        </div>
        {path ? (
          <svg viewBox="0 0 100 24" className="h-7 w-24 shrink-0" preserveAspectRatio="none">
            <path
              d={path}
              fill="none"
              stroke={ORDINAL[3]}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        ) : null}
      </div>
      {note ? <div className="mt-2 text-[11.5px] leading-snug text-white/40">{note}</div> : null}
    </>
  );

  // A metric you cannot open is a dead end: the whole point of a number is to
  // get to the rows behind it. Only linked where a real list exists.
  return href ? (
    <Link href={href} className="group block min-w-0 flex-1 px-5 py-4 hover:bg-white/[0.03]">
      {body}
    </Link>
  ) : (
    <div className="min-w-0 flex-1 px-5 py-4">{body}</div>
  );
}

export function StatTile({
  label,
  value,
  unit,
  note,
  tone,
}: {
  label: string;
  value: number | string | null;
  unit?: string;
  note?: string;
  tone?: "warn";
}) {
  const missing = value === null;
  return (
    <div className="bg-[var(--surface)]/50 px-4 py-3.5 transition hover:bg-white/[0.04]">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.12em] text-white/35">
        {label}
      </div>
      <div
        className="mt-1 font-mono text-[22px] font-semibold leading-none tabular-nums"
        style={{
          color: missing ? "rgba(255,255,255,0.15)" : tone === "warn" ? STATUS.warning : undefined,
        }}
      >
        <span className={missing || tone ? "" : "text-[var(--text)]"}>{missing ? "—" : value}</span>
        {!missing && unit ? (
          <span className="ml-0.5 text-[11px] font-medium text-white/30">{unit}</span>
        ) : null}
      </div>
      {note ? <div className="mt-1 text-[11px] leading-snug text-white/35">{note}</div> : null}
    </div>
  );
}

const CHIP: Record<StatusKey | "mute", { bg: string; fg: string }> = {
  good: { bg: "rgba(12,163,12,0.14)", fg: STATUS.good },
  warning: { bg: "rgba(250,178,25,0.14)", fg: STATUS.warning },
  serious: { bg: "rgba(236,131,90,0.14)", fg: STATUS.serious },
  critical: { bg: "rgba(208,59,59,0.16)", fg: STATUS.critical },
  mute: { bg: "rgba(255,255,255,0.06)", fg: "rgba(255,255,255,0.45)" },
};

/** Status never travels as colour alone — the word is always in the chip. */
export function Chip({ tone, children }: { tone: StatusKey | "mute"; children: React.ReactNode }) {
  const c = CHIP[tone];
  return (
    <span
      className="inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}

/**
 * One funnel stage. Ordered ramp, 4px rounded data-end anchored to the baseline,
 * 2px gap between fills so adjacent stages never merge.
 */
export function FunnelRow({
  label,
  value,
  max,
  step,
  hint,
}: {
  label: string;
  value: number;
  max: number;
  step: number;
  hint?: string;
}) {
  const w = barWidth(value, max);
  const share = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="group flex items-center gap-3 py-1" title={`${label}: ${value} (${share}%)`}>
      <span className="w-24 shrink-0 text-[11.5px] text-white/55">{label}</span>
      <span className="relative h-[18px] flex-1 overflow-hidden rounded-[4px] bg-white/[0.04]">
        <span
          className="absolute inset-y-0 left-0 rounded-r-[4px] transition-[width] duration-500"
          style={{ width: `${w}%`, background: ORDINAL[Math.min(step, ORDINAL.length - 1)] }}
        />
      </span>
      <span className="w-24 shrink-0 text-right font-mono text-[12px] tabular-nums text-white/70">
        {value}
        <span className="ml-1.5 text-white/30">{share}%</span>
      </span>
      {hint ? (
        <span className="hidden w-40 shrink-0 text-[11px] text-white/30 lg:block">{hint}</span>
      ) : null}
    </div>
  );
}
