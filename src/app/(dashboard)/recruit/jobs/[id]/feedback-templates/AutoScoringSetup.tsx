"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Sparkles, CheckCircle2, ArrowRight, Wand2 } from "lucide-react";

/**
 * One-click "scoring setup" entry point: chains JD → rubric + Ideal Candidate Profile →
 * interview scorecard, all as drafts to review. Self-contained — probes the FitScore flag and
 * renders nothing when scoring isn't enabled or everything is already set up.
 */
export function AutoScoringSetup({
  jobId,
  hasScorecard,
  onCreated,
}: {
  jobId: string;
  hasScorecard: boolean;
  onCreated?: () => void;
}) {
  const [probing, setProbing] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [rubricApproved, setRubricApproved] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    rubricCreated: boolean;
    scorecardCreated: boolean;
    needsApproval: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetch(`/api/fitscore/jd-base?jobId=${encodeURIComponent(jobId)}`, {
          credentials: "include",
        });
        if (!active) return;
        if (res.status === 403) {
          setEnabled(false);
          return;
        }
        setEnabled(true);
        const body = (await res.json().catch(() => ({}))) as {
          data?: { jdBase?: { approvedBy?: string | null } | null };
          jdBase?: { approvedBy?: string | null } | null;
        };
        const jd = body?.data?.jdBase ?? body?.jdBase ?? null;
        setRubricApproved(Boolean(jd?.approvedBy));
      } catch {
        // leave disabled on error
      } finally {
        if (active) setProbing(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [jobId]);

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}/scoring-setup/auto`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        data?: {
          rubric?: { created?: boolean };
          scorecard?: { created?: boolean };
          needsApproval?: boolean;
        };
        error?: string;
      };
      if (!res.ok) {
        setError(body?.error ?? "Couldn't auto-create the scoring setup. Please retry.");
        return;
      }
      const data = body?.data ?? {};
      setResult({
        rubricCreated: Boolean(data.rubric?.created),
        scorecardCreated: Boolean(data.scorecard?.created),
        needsApproval: Boolean(data.needsApproval),
      });
      onCreated?.();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setRunning(false);
    }
  };

  // Hide while probing, when scoring isn't enabled, or when everything is already set up.
  if (probing || !enabled) return null;
  if (!result && rubricApproved && hasScorecard) return null;

  if (result) {
    return (
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="space-y-1.5">
            <p className="text-sm font-medium text-[var(--text)]">Scoring setup drafted</p>
            <ul className="space-y-0.5 text-xs text-white/70">
              <li>
                {result.rubricCreated
                  ? "Created a scoring rubric + ideal candidate profile from the JD."
                  : "Used the existing scoring rubric + ideal candidate profile."}
              </li>
              <li>
                {result.scorecardCreated
                  ? "Generated an interview scorecard from the rubric — review it below."
                  : "Kept your existing interview scorecard."}
              </li>
            </ul>
            {result.needsApproval ? (
              <Link
                href={`/recruit/jobs/${jobId}#ideal-profile-setup`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline"
              >
                Review &amp; approve the scoring rubric <ArrowRight size={13} />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/[0.06] p-4">
      <div className="flex items-start gap-3">
        <Sparkles size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
        <div className="flex-1 space-y-2">
          <div>
            <p className="text-sm font-medium text-[var(--text)]">
              Auto-create scoring setup from the JD + ideal candidate
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              In one step: draft the scoring rubric and ideal candidate profile, then an interview
              scorecard from them. Everything stays a draft for you to review and approve.
            </p>
          </div>
          {error ? <p className="text-xs text-red-400">{error}</p> : null}
          <button
            type="button"
            onClick={run}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {running ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />}
            {running ? "Setting up…" : "Auto-create scoring setup"}
          </button>
        </div>
      </div>
    </div>
  );
}
