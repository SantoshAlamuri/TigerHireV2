"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calendar, Loader2 } from "lucide-react";
import type { ApplicationStatus, FitScore } from "@/types";
import type { ReadinessResult } from "@/lib/fitscore/readiness";
import { scoreDisplay } from "@/lib/v2/score-display";
import { CandidateVerdictActions } from "@/components/dashboard/CandidateVerdictActions";
import { useToast } from "@/components/ui/Toast";

/* ------------------------------------------------------------------ *
 *  Decision Strip — concept v3 ("Decision Strip") made real.
 *  Row 1 (CandidateDecisionBand): who + verdict · scoreband · actions.
 *  Row 3 (CandidateTriageRow): green evidence · amber cautions (askable
 *  on WhatsApp) · missing-data card whose gaps are actions.
 * ------------------------------------------------------------------ */

export interface DecisionGap {
  key: string;
  label: string;
  actionLabel: string;
  action:
    | { kind: "preset"; preset: "request_cv" | "ask_logistics" }
    | { kind: "link"; href: string }
    | { kind: "anchor"; href: string };
}

export interface DecisionApplication {
  id: string;
  status: ApplicationStatus;
  jobId: string | null;
  jobTitle: string | null;
}

type VerdictTone = "strong" | "warn" | "risk" | "neutral";

function verdictTone(label: string | null): VerdictTone {
  if (!label) return "neutral";
  const v = label.toLowerCase();
  if (v.includes("strong") || v.includes("hidden gem") || v.includes("safe")) return "strong";
  if (v.includes("weak") || v.includes("pass") || v.includes("not a fit") || v.includes("reject"))
    return "risk";
  if (v.includes("moderate") || v.includes("good") || v.includes("niche")) return "warn";
  return "neutral";
}

const VERDICT_PILL: Record<VerdictTone, string> = {
  strong: "bg-emerald-400 text-emerald-950",
  warn: "bg-amber-400 text-amber-950",
  risk: "bg-rose-500 text-white",
  neutral: "bg-[var(--bg-elevated)] text-[var(--text)] border border-[var(--border)]",
};

/** The whole band carries the verdict — a Strong Hire and a Pass must FEEL different. */
const VERDICT_CHROME: Record<VerdictTone, string> = {
  strong: "border-emerald-500/30 shadow-[inset_3px_0_0_0_rgba(52,211,153,0.6)]",
  warn: "border-amber-500/25 shadow-[inset_3px_0_0_0_rgba(251,191,36,0.55)]",
  risk: "border-rose-500/30 shadow-[inset_3px_0_0_0_rgba(244,63,94,0.55)]",
  neutral: "",
};

/** Value → tone for the thin bar under a score number (value encoding, not branding). */
function valueBarClass(v: number | null): string {
  if (v == null) return "bg-[var(--border)]";
  if (v >= 75) return "bg-emerald-400";
  if (v >= 50) return "bg-amber-400";
  return "bg-rose-400";
}

function marketDisplay(score: FitScore | null): { value: string; sub: string } {
  if (!score) return { value: "—", sub: "not scored" };
  if (score.marketLabel) {
    const short = score.marketLabel.split(" — ")[0]?.split(" - ")[0]?.trim() ?? score.marketLabel;
    return { value: short, sub: "peer pool" };
  }
  if (score.marketPercentile != null && Number.isFinite(score.marketPercentile)) {
    return {
      value: `Top ${Math.max(0, Math.min(100, 100 - Math.round(score.marketPercentile)))}%`,
      sub: "peer pool",
    };
  }
  return { value: "—", sub: "building" };
}

function Seg({
  label,
  value,
  sub,
  tone,
  title,
  barValue,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tone: "amber" | "teal" | "violet" | "emerald";
  title?: string;
  /** 0–100 → a 2px value-toned bar under the number; null/undefined = muted stub. */
  barValue?: number | null;
}) {
  const toneText = {
    amber: "text-amber-300",
    teal: "text-teal-300",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
  }[tone];
  const toneLabel = {
    amber: "text-amber-400/90",
    teal: "text-teal-400/90",
    violet: "text-violet-400/90",
    emerald: "text-emerald-400/90",
  }[tone];
  return (
    <div
      className="min-w-[5rem] border-r border-[var(--border)]/60 px-4 py-2.5 text-center last:border-r-0"
      title={title}
    >
      <p className={`text-[9px] font-bold uppercase tracking-[0.12em] ${toneLabel}`}>{label}</p>
      <p className={`mt-0.5 text-xl font-extrabold leading-tight tabular-nums ${toneText}`}>
        {value}
      </p>
      {barValue !== undefined ? (
        <span className="mx-auto mb-1 mt-1 block h-[3px] w-9 overflow-hidden rounded-full bg-[var(--border)]/70">
          <span
            className={`block h-full rounded-full ${valueBarClass(barValue)}`}
            style={{ width: `${Math.max(6, Math.min(100, barValue ?? 0))}%` }}
          />
        </span>
      ) : null}
      <p className="text-[10px] leading-tight text-[var(--text-subtle)]">{sub}</p>
    </div>
  );
}

export function CandidateDecisionBand({
  candidateName,
  statusChips,
  metaLine,
  score,
  readiness,
  application,
  scheduleHref,
  moveHref,
  onNavigateTab,
  onStatusChange,
}: {
  candidateName: string;
  statusChips: string[];
  metaLine: string;
  score: FitScore | null;
  readiness: ReadinessResult | null;
  application: DecisionApplication | null;
  scheduleHref: string | null;
  /** "#tab:<name>" switches the page tab via onNavigateTab; plain anchors navigate. */
  moveHref?: string | null;
  onNavigateTab?: (tab: "evidence" | "profile" | "logistics" | "activity" | "notes") => void;
  onStatusChange: () => void | Promise<void>;
}) {
  const market = marketDisplay(score);
  const narrative = scoreDisplay(
    score?.overallScore ?? null,
    score?.oneLineSummary ?? null,
    score?.band ?? null,
  );
  const icp =
    score?.idealMatchPct != null && score.idealMatchPct > 0 ? `${score.idealMatchPct}%` : "—";
  const verdictLabel = score?.verdict ?? score?.band ?? null;
  const tone = verdictTone(verdictLabel);

  return (
    <div
      className={`card-lifted grid grid-cols-1 items-center gap-5 rounded-2xl border p-5 lg:grid-cols-[minmax(0,1fr)_auto_auto] ${VERDICT_CHROME[tone]}`}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-lg font-semibold tracking-tight text-[var(--text)]">
            {candidateName}
          </span>
          {statusChips.map((chip) => (
            <span key={chip} className="text-xs text-[var(--text-subtle)]">
              · {chip}
            </span>
          ))}
        </p>
        <p className="mt-0.5 truncate text-sm text-[var(--text-muted)]">{metaLine}</p>
        {verdictLabel ? (
          <div className="mt-2.5">
            <span
              className={`mr-2 inline-block rounded-md px-2 py-0.5 align-[1px] text-[10px] font-extrabold uppercase tracking-wide ${VERDICT_PILL[tone]}`}
            >
              {verdictLabel}
            </span>
            <span className="text-sm font-semibold text-[var(--text)]">
              {score?.verdictAction ?? "Review evidence"}
            </span>
            {/* The stored narrative is written at scoring time and is not
                rewritten when calibration moves the number. Left alone it quotes
                a score the card contradicts — seen live as prose reading
                "FitScore 88" beside a Quality of 81. The embedded figure is
                removed and the disagreement is stated, rather than letting two
                numbers argue on screen. */}
            <p className="mt-0.5 text-[11px] leading-snug text-[var(--text-subtle)]">
              {narrative.narrative ? `${narrative.narrative} · ` : ""}confidence{" "}
              {score?.confidence ?? "—"}
            </p>
            {narrative.staleNarrativeScore !== null ? (
              <p className="mt-1 text-[11px] leading-snug text-amber-300/85">
                This explanation was written when the score read{" "}
                <strong>{narrative.staleNarrativeScore}</strong>, before calibration. The score
                shown above is the current one.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex overflow-x-auto rounded-xl border border-[var(--border)]/80 bg-[var(--surface)]/40">
        <Seg
          label="Quality"
          tone="amber"
          sub="rubric"
          barValue={score ? Math.round(score.overallScore) : null}
          title={score?.shadowBlendFormula ?? undefined}
          value={
            score ? (
              <>
                {Math.round(score.overallScore)}
                {score.shadowBlendVersion === "v5_outcomes" && score.shadowScore != null ? (
                  <span className="ml-1 text-xs font-bold text-sky-300/90">
                    S{score.shadowScore}
                  </span>
                ) : null}
              </>
            ) : (
              "—"
            )
          }
        />
        <Seg
          label="Ready"
          tone="teal"
          value={readiness?.score ?? "—"}
          barValue={readiness ? readiness.score : null}
          sub={
            readiness ? (
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex gap-[3px]" aria-hidden>
                  {readiness.parts.map((part) => (
                    <span
                      key={part.key}
                      className={`h-1.5 w-1.5 rounded-full ${
                        part.value != null ? "bg-teal-400" : "bg-[var(--border)]"
                      }`}
                    />
                  ))}
                </span>
                <span>{readiness.score == null ? "add signals" : readiness.band}</span>
              </span>
            ) : (
              "no application"
            )
          }
          title={readiness?.parts.map((p) => `${p.label}: ${p.detail}`).join("\n")}
        />
        {/* "ICP match", not "ICP": the number is how closely this person matches
            the ideal profile, and the bare acronym read as a category. */}
        <Seg
          label="ICP match"
          tone="violet"
          value={icp}
          sub={icp === "—" ? "no baseline" : "vs ideal"}
        />
        <Seg label="Market" tone="emerald" value={market.value} sub={market.sub} />
      </div>

      {/* Functional and minimal: Shortlist · Reject · Move · Schedule. No labels, no chrome. */}
      <div className="flex flex-wrap items-center gap-2">
        {application ? (
          <CandidateVerdictActions
            applicationId={application.id}
            status={application.status}
            onStatusChange={onStatusChange}
            compact
          />
        ) : null}
        {moveHref ? (
          <button
            type="button"
            onClick={() => {
              if (moveHref.startsWith("#tab:") && onNavigateTab) {
                onNavigateTab(moveHref.slice(5) as "logistics");
              } else {
                window.location.hash = moveHref;
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-interactive)] px-3.5 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white"
          >
            <ArrowUpRight size={15} />
            Move
          </button>
        ) : null}
        {scheduleHref ? (
          <Link
            href={scheduleHref}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-interactive)] px-3.5 py-2 text-sm font-medium text-white/75 transition hover:bg-white/[0.04] hover:text-white"
          >
            <Calendar size={15} />
            Schedule
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export function CandidateTriageRow({
  applicationId,
  greens,
  ambers,
  gaps,
  onNavigateTab,
}: {
  applicationId: string | null;
  greens: string[];
  ambers: string[];
  gaps: DecisionGap[];
  onNavigateTab?: (tab: "evidence" | "profile" | "logistics" | "activity" | "notes") => void;
}) {
  const { toast } = useToast();
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  /** Only system-framed preset questions are ever sent — internal flag text never reaches
      the candidate, and asks are for MISSING information, not re-verifying claims. */
  async function sendQuery(body: { preset: string }, key: string) {
    if (!applicationId) return;
    setSendingKey(key);
    try {
      const res = await fetch(`/api/applications/${applicationId}/whatsapp-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(payload.error ?? "WhatsApp send failed");
      toast({
        title: "Sent on WhatsApp",
        description: "Logged in the activity timeline.",
        tone: "success",
      });
    } catch (e) {
      toast({
        title: "Couldn't send",
        description: e instanceof Error ? e.message : "WhatsApp send failed",
        tone: "error",
      });
    } finally {
      setSendingKey(null);
    }
  }

  if (greens.length === 0 && ambers.length === 0 && gaps.length === 0) return null;

  const miniBtn =
    "shrink-0 rounded-md border border-[var(--border-interactive)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[11px] font-semibold text-[var(--text)] transition hover:bg-white/[0.06] disabled:opacity-50";

  return (
    <div className="grid items-start gap-3.5 md:grid-cols-3">
      {greens.length > 0 ? (
        <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.05] p-3.5">
          <ul className="flex flex-col gap-2 text-[13px] leading-snug text-[var(--text-muted)]">
            {greens.slice(0, 6).map((item) => (
              <li key={item} className="flex gap-2">
                <span className="shrink-0 font-semibold text-emerald-400" aria-hidden>
                  ✓
                </span>
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ambers.length > 0 ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3.5">
          <ul className="flex flex-col gap-2 text-[13px] leading-snug text-[var(--text-muted)]">
            {ambers.slice(0, 6).map((item) => (
              <li key={item} className="flex gap-2">
                <span className="shrink-0 font-semibold text-amber-400" aria-hidden>
                  ⚠
                </span>
                <span className="min-w-0 break-words">{item}</span>
              </li>
            ))}
          </ul>
          {/* Cautions are INTERNAL — probe them in the interview. Never surfaced to the
              candidate: WhatsApp asks are only for missing information, framed by us. */}
          <p className="mt-2.5 text-[10px] uppercase tracking-[0.12em] text-amber-400/60">
            Probe in interview
          </p>
        </div>
      ) : null}

      {gaps.length > 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-interactive)] bg-white/[0.015] p-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[var(--text-subtle)]">
            Missing → act
          </p>
          <ul className="mt-2.5 flex flex-col gap-2 text-[12.5px] text-[var(--text-muted)]">
            {gaps.map((gap) => (
              <li key={gap.key} className="flex items-center justify-between gap-2.5">
                <span className="min-w-0 break-words">{gap.label}</span>
                {gap.action.kind === "preset" ? (
                  <button
                    type="button"
                    disabled={!applicationId || sendingKey === gap.key}
                    className={miniBtn}
                    onClick={() =>
                      void sendQuery({ preset: (gap.action as { preset: string }).preset }, gap.key)
                    }
                  >
                    {sendingKey === gap.key ? "Sending…" : gap.actionLabel}
                  </button>
                ) : gap.action.kind === "link" ? (
                  <Link href={gap.action.href} className={miniBtn}>
                    {gap.actionLabel}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className={miniBtn}
                    onClick={() => {
                      const href = (gap.action as { href: string }).href;
                      if (href.startsWith("#tab:") && onNavigateTab) {
                        onNavigateTab(href.slice(5) as "activity");
                      } else {
                        window.location.hash = href;
                      }
                    }}
                  >
                    {gap.actionLabel}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
