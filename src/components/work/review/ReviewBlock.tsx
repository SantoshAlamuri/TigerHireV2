"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelProps } from "@/components/work/panels";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import { useReviewWorkspace } from "@/lib/v2/use-review-workspace";
import {
  bulkDecide,
  currentItem,
  decide,
  lastHoldUndoIds,
  move,
  remaining,
  toggleSelect,
  undoLast,
  type Decision,
  type QueueItem,
} from "@/lib/v2/review-queue";
import { useReviewData } from "@/app/(dashboard)/recruit/v2/jobs/[id]/review/useReviewData";
import { useDecisionSync } from "@/app/(dashboard)/recruit/v2/jobs/[id]/review/useDecisionSync";
import { useEvidencePack } from "@/app/(dashboard)/recruit/v2/jobs/[id]/review/useEvidencePack";
import {
  agentSummary,
  criterionRows,
  decisionLog,
  defaultMode,
  groupForTriage,
  isFallbackScore,
  isTypingTarget,
  keyAction,
  logistics,
  resolveThresholds,
  risks as riskList,
  sessionSummary,
  upNext,
  verifiedQuotes,
} from "@/lib/work/review";
import { FocusView } from "./FocusView";
import { ReasonChoice } from "./ReasonChoice";
import { TriageList, type TriageRow } from "./TriageList";
import s from "./review.module.css";

interface JdBaseView {
  jdBase?: {
    weights?: Record<string, number> | null;
    fitThresholds?: unknown;
    idealCandidateProfile?: { must_haves?: string[] | null } | null;
  } | null;
}

interface CandidateScore {
  job_id?: string | null;
  one_line_summary?: string | null;
  v2_score_breakdown?: { dimensions?: unknown } | null;
  candidates?: { current_role?: string | null } | null;
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="wd-problem">
      {children}
    </p>
  );
}

/**
 * Candidate review, native. Replaces the embedded classic review screen with
 * the same data, the same decisions and the same rules: decisions PATCH the
 * application through the existing API, reject always carries a reason, only
 * a hold can be undone, and a seat that does not review is told so.
 */
export function ReviewBlock(props: PanelProps) {
  const { user, loading } = useAuth();
  if (loading && !user)
    return (
      <p role="status" className="wd-muted">
        Loading the candidates…
      </p>
    );
  if (!capabilitiesFor(user?.role).reviewApplications) {
    return (
      <div className="wd-stack" style={{ gap: 16 }}>
        <p className="wd-lede">
          Reviewing applicants is not part of your seat. The shortlist and interviews for this job
          appear in the next steps.
        </p>
      </div>
    );
  }
  return <ReviewWork {...props} userId={user?.id ?? "anonymous"} />;
}

function ReviewWork({ jobId, onDone, onLog, userId }: PanelProps & { userId: string }) {
  const {
    data: applied,
    loading,
    error,
    refetch: refetchApplied,
    mustHaves,
    scoresByCandidate: appliedScores,
    requirementsUnavailable,
  } = useReviewData(jobId);
  // "Viewed" applicants still await a decision (the job's counts include
  // them), but the shared review query only asks for "applied". Ask for both
  // so nobody counted as waiting is missing from the list.
  const viewed = useApiQuery<NonNullable<typeof applied>>("/api/applications", {
    jobId,
    status: "viewed",
    limit: 100,
    fields: "review",
    order: "score",
  });
  const data = useMemo(() => {
    if (!applied) return applied;
    const extra = viewed.data?.applications ?? [];
    if (!extra.length) return applied;
    return {
      ...applied,
      applications: [...applied.applications, ...extra],
      pagination: {
        ...applied.pagination,
        total: (applied.pagination?.total ?? applied.applications.length) + extra.length,
      },
    };
  }, [applied, viewed.data]);
  const scoresByCandidate = useMemo(() => {
    const m = new Map(appliedScores);
    for (const row of viewed.data?.applications ?? []) {
      if (row.fit_scores && !m.has(row.candidate_id))
        m.set(row.candidate_id, { ...row.fit_scores, candidate_id: row.candidate_id });
    }
    return m;
  }, [appliedScores, viewed.data]);
  const { refetch: refetchViewed } = viewed;
  const refetch = useCallback(
    () => Promise.all([refetchApplied(), refetchViewed()]),
    [refetchApplied, refetchViewed],
  );
  // Same key as useReviewData's rubric query, so this is served from cache.
  const base = useApiQuery<JdBaseView>(
    "/api/fitscore/jd-base",
    { jobId },
    { persistToSessionStorage: true },
  );
  const { t: thresholds, fromJob: thresholdsFromJob } = resolveThresholds(
    base.data?.jdBase?.fitThresholds,
  );

  const rowsById = useMemo(() => new Map((data?.applications ?? []).map((a) => [a.id, a])), [data]);
  const queueItems: QueueItem[] = useMemo(
    () =>
      (data?.applications ?? [])
        .map((a) => ({
          id: a.id,
          name: a.candidates?.name?.trim() || "Unnamed candidate",
          score: scoresByCandidate.get(a.candidate_id)?.overall_score ?? null,
        }))
        .sort((x, y) => (y.score ?? -1) - (x.score ?? -1)),
    [data, scoresByCandidate],
  );

  const [q, setQ] = useReviewWorkspace(
    queueItems,
    `tigerhire.work.review:${userId}:${jobId}`,
    null,
  );
  const { persist, restoreHold, failed } = useDecisionSync(jobId);
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  const [asking, setAsking] = useState<"one" | "bulk" | null>(null);
  const [mode, setMode] = useState<"list" | "focus" | null>(null);

  const item = currentItem(q);
  const left = remaining(q);
  const decidedIds = useMemo(() => q.decisions.map((d) => d.id), [q.decisions]);
  const shownMode = mode ?? defaultMode(left);
  const nameOf = useCallback(
    (id: string) => q.items.find((i) => i.id === id)?.name ?? "a candidate",
    [q.items],
  );

  /* ---------- decisions (classic semantics, with the work log) ---------- */

  const act = useCallback(
    async (d: Decision, reason?: string) => {
      if (lock.current) return;
      const target = currentItem(q);
      if (!target || q.decisions.some((r) => r.id === target.id)) return;
      try {
        decide(q, d, reason);
      } catch {
        return;
      }
      lock.current = true;
      setSaving(true);
      try {
        if (await persist(target.id, d, reason)) {
          setQ((prev) =>
            decide({ ...prev, cursor: prev.items.findIndex((r) => r.id === target.id) }, d, reason),
          );
          onLog("you", decisionLog(d, target.name, reason));
        }
      } finally {
        lock.current = false;
        setSaving(false);
      }
    },
    [persist, q, setQ, onLog],
  );

  const actBulk = useCallback(
    async (d: Decision, reason?: string, only?: string[]) => {
      if (lock.current) return;
      const pool = only ?? q.selected;
      try {
        bulkDecide({ ...q, selected: pool }, d, reason);
      } catch {
        return;
      }
      const ids = pool.filter((id) => !q.decisions.some((r) => r.id === id));
      if (!ids.length) return;
      lock.current = true;
      setSaving(true);
      try {
        const saved = await Promise.all(
          ids.map(async (id) => ((await persist(id, d, reason)) ? id : null)),
        );
        const accepted = saved.filter((id): id is string => id !== null);
        if (accepted.length) {
          setQ((prev) => ({
            ...bulkDecide({ ...prev, selected: accepted }, d, reason),
            selected: prev.selected.filter((id) => !accepted.includes(id)),
          }));
          onLog(
            "you",
            decisionLog(d, accepted.length === 1 ? nameOf(accepted[0]) : accepted.length, reason),
          );
        }
      } finally {
        lock.current = false;
        setSaving(false);
      }
    },
    [persist, q, setQ, onLog, nameOf],
  );

  const holdUndo = lastHoldUndoIds(q);
  const undoHold = useCallback(async () => {
    if (lock.current) return;
    const ids = lastHoldUndoIds(q);
    if (!ids?.length) return;
    lock.current = true;
    setSaving(true);
    try {
      const saved = await Promise.all(ids.map(async (id) => ((await restoreHold(id)) ? id : null)));
      if (saved.every(Boolean)) {
        setQ(undoLast);
        onLog(
          "you",
          `Took ${ids.length === 1 ? nameOf(ids[0]) : `${ids.length} candidates`} off hold`,
        );
      }
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }, [q, restoreHold, setQ, onLog, nameOf]);

  const pickReason = (id: string) => {
    const bulk = asking === "bulk";
    setAsking(null);
    void (bulk ? actBulk("reject", id) : act("reject", id));
  };

  /* ---------- finishing ---------- */

  const total = data?.pagination?.total ?? q.items.length;
  const moreWaiting = total > q.items.length;
  const finished = q.items.length > 0 && left === 0 && q.decisions.length > 0;
  const doneSent = useRef(false);
  useEffect(() => {
    if (!finished || moreWaiting || doneSent.current) return;
    doneSent.current = true;
    onDone("Review finished");
  }, [finished, moreWaiting, onDone]);

  /* ---------- keyboard, scoped to this block ---------- */

  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && !error) root.current?.focus({ preventScroll: true });
  }, [loading, error]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (saving || isTypingTarget(e.target as Element)) return;
    const a = keyAction(e, asking !== null);
    if (!a) return;
    e.preventDefault();
    if (a.kind === "cancel") setAsking(null);
    else if (a.kind === "reason") pickReason(a.id);
    else if (a.kind === "next") setQ((p) => move(p, 1));
    else if (a.kind === "prev") setQ((p) => move(p, -1));
    else if (a.kind === "undo") void undoHold();
    // In the list, decisions go through selection; single-key decisions belong to the focus view.
    else if (shownMode !== "focus" || !item || decidedIds.includes(item.id)) return;
    else if (a.kind === "advance") void act("advance");
    else if (a.kind === "hold") void act("hold");
    else if (a.kind === "reject") setAsking("one");
  };

  /* ---------- the focused candidate ---------- */

  const row = item ? rowsById.get(item.id) : undefined;
  const score = row ? scoresByCandidate.get(row.candidate_id) : undefined;
  const pack = useEvidencePack(row, mustHaves, score);
  const detail = useApiQuery<{ scores?: CandidateScore[] }>(
    shownMode === "focus" && row?.candidate_id ? "/api/fit-score" : null,
    row?.candidate_id ? { candidateId: row.candidate_id } : undefined,
  );
  const detailRow = detail.data?.scores?.find((r) => r.job_id === jobId);
  const quotes = useMemo(() => verifiedQuotes(score?.evidence_json), [score]);
  const criteria = useMemo(
    () =>
      criterionRows({
        weights: base.data?.jdBase?.weights,
        dimensions: detailRow?.v2_score_breakdown?.dimensions,
        breakdown: score?.criteria_breakdown,
        quotes,
      }),
    [base.data, detailRow, score, quotes],
  );

  const triageRows = useMemo(
    () =>
      groupForTriage<TriageRow>(
        q.items.map((it) => {
          const r = rowsById.get(it.id);
          const fs = r ? scoresByCandidate.get(r.candidate_id) : undefined;
          const firstFlag = (xs?: (string | null)[] | null) =>
            (xs ?? []).find((x): x is string => Boolean(x && x.trim())) ?? null;
          return {
            ...it,
            location: r?.candidates?.location ?? null,
            years: r?.candidates?.experience_years ?? null,
            noticeDays: r?.notice_period_days ?? null,
            ctcLpa: r?.expected_ctc_lpa ?? null,
            plus: firstFlag(fs?.green_flags),
            minus: firstFlag(fs?.red_flags) ?? firstFlag(fs?.amber_flags),
            scoringMethod: fs?.scoring_method ?? null,
          };
        }),
        decidedIds,
        thresholds,
      ),
    [q.items, rowsById, scoresByCandidate, decidedIds, thresholds],
  );

  /* ---------- states ---------- */

  if (loading && !data)
    return (
      <p role="status" className="wd-muted">
        Loading the candidates…
      </p>
    );
  if (error && !data)
    return (
      <div className="wd-stack" style={{ gap: 16 }}>
        <Problem>
          The candidates could not be loaded. Check your connection, then try again.
        </Problem>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </div>
    );
  if (q.items.length === 0)
    return (
      <div className="wd-stack" style={{ gap: 20 }}>
        <p className="wd-lede">
          Nobody is waiting for you. New applicants appear here once the agent has scored them.
        </p>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn" onClick={() => void refetch()}>
            Check for new applicants
          </button>
        </div>
      </div>
    );

  const saveProblem = failed.length > 0 && (
    <Problem>
      {failed.length === 1 ? "One decision was" : `${failed.length} decisions were`} not saved.
      Those candidates are still in the list; decide again to retry.
    </Problem>
  );

  if (left === 0)
    return (
      <div className="wd-stack" style={{ gap: 20 }} ref={root} tabIndex={-1} onKeyDown={onKeyDown}>
        {saveProblem}
        <p className="wd-lede">
          {moreWaiting
            ? `This batch is done. ${sessionSummary(q.decisions)} ${total - q.items.length} more are waiting.`
            : `Everyone has a decision. ${sessionSummary(q.decisions)}`}
        </p>
        <div className="wd-row-actions">
          {moreWaiting && (
            <button type="button" className="wd-btn go" onClick={() => void refetch()}>
              Review the next batch
            </button>
          )}
          {holdUndo && (
            <button
              type="button"
              className="wd-btn"
              disabled={saving}
              onClick={() => void undoHold()}
            >
              Undo hold
            </button>
          )}
        </div>
      </div>
    );

  const position = item
    ? `${q.items.findIndex((i) => i.id === item.id) + 1} of ${q.items.length}`
    : "";
  const itemDecided = item ? decidedIds.includes(item.id) : true;
  const nextUp = item ? upNext(q.items, q.cursor, decidedIds) : [];
  const profileHref = row?.candidate_id
    ? `/recruit/candidates/${row.candidate_id}?applicationId=${encodeURIComponent(row.id)}&jobId=${encodeURIComponent(jobId)}&returnTo=${encodeURIComponent(`/work/jobs/${jobId}?at=review`)}`
    : null;

  const decideColumn = (
    <>
      {asking === "one" ? (
        <ReasonChoice count={1} onPick={pickReason} onCancel={() => setAsking(null)} />
      ) : (
        <>
          <span className="wd-sig you">Your call</span>
          <button
            type="button"
            className="wd-btn go"
            disabled={saving || itemDecided}
            onClick={() => void act("advance")}
          >
            Move to interview{" "}
            <span className={s.kbd} aria-hidden="true">
              A
            </span>
          </button>
          <button
            type="button"
            className="wd-btn"
            disabled={saving || itemDecided}
            onClick={() => void act("hold")}
          >
            Hold{" "}
            <span className={s.kbd} aria-hidden="true">
              H
            </span>
          </button>
          <button
            type="button"
            className="wd-btn"
            disabled={saving || itemDecided}
            onClick={() => setAsking("one")}
          >
            Not a fit{" "}
            <span className={s.kbd} aria-hidden="true">
              R
            </span>
          </button>
          {holdUndo && (
            <button
              type="button"
              className="wd-btn quiet"
              disabled={saving}
              onClick={() => void undoHold()}
            >
              Undo hold (U)
            </button>
          )}
          <span className={s.hint} role="status">
            {saving
              ? "Saving your decision…"
              : itemDecided
                ? "Already decided. Press J for the next one."
                : "J and K move between candidates."}
          </span>
        </>
      )}
      {nextUp.length > 0 && (
        <div className="wd-stack" style={{ gap: 8, marginTop: 20 }}>
          <span className="wd-small wd-muted">Up next</span>
          <ul className={s.next}>
            {nextUp.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() =>
                    setQ((p) => ({ ...p, cursor: p.items.findIndex((r) => r.id === n.id) }))
                  }
                >
                  <span className={s.name}>{n.name}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{n.score ?? "—"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <div
      ref={root}
      className={s.root}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      aria-label="Candidate review"
    >
      <div className={s.toolbar}>
        <span className={s.counts}>
          {left} waiting in this batch
          {total > q.items.length ? `, ${total - q.decisions.length} in all` : ""}
          {q.decisions.length ? ` · ${q.decisions.length} decided` : ""}
        </span>
        <div className={s.modes} role="group" aria-label="View">
          <button
            type="button"
            className={s.mode}
            aria-pressed={shownMode === "list"}
            onClick={() => setMode("list")}
          >
            List
          </button>
          <button
            type="button"
            className={s.mode}
            aria-pressed={shownMode === "focus"}
            onClick={() => setMode("focus")}
          >
            One at a time
          </button>
        </div>
      </div>

      {!thresholdsFromJob && !base.loading && (
        <p className={s.notice}>
          This job has no score cut-offs of its own, so groups use the default bar (
          {thresholds.good} and above is strong, {thresholds.moderate} to {thresholds.good - 1} is
          borderline).
        </p>
      )}
      {saveProblem}

      {shownMode === "list" ? (
        <>
          <TriageList
            groups={triageRows}
            currentId={item?.id ?? null}
            selected={q.selected}
            disabled={saving}
            onOpen={(id) => {
              setQ((p) => ({ ...p, cursor: p.items.findIndex((r) => r.id === id) }));
              setMode("focus");
            }}
            onToggle={(id) => {
              if (!saving) setQ((p) => toggleSelect(p, id));
            }}
            onQuick={(id, d) => {
              if (d === "reject") {
                setQ((p) => ({ ...p, selected: [id] }));
                setAsking("bulk");
              } else void actBulk(d, undefined, [id]);
            }}
            onSelectGroup={(ids, on) =>
              setQ((p) => ({
                ...p,
                selected: on
                  ? [...p.selected, ...ids.filter((id) => !p.selected.includes(id))]
                  : p.selected.filter((id) => !ids.includes(id)),
              }))
            }
          />
          {(q.selected.length > 0 || holdUndo) && (
            <div className={s.bulk} role="region" aria-label="Selected candidates">
              {asking === "bulk" ? (
                <div className={s.wide}>
                  <ReasonChoice
                    count={q.selected.length}
                    onPick={pickReason}
                    onCancel={() => setAsking(null)}
                  />
                </div>
              ) : (
                <>
                  {q.selected.length > 0 && (
                    <>
                      <span className="wd-small">{q.selected.length} selected</span>
                      <button
                        type="button"
                        className="wd-btn go"
                        disabled={saving}
                        onClick={() => void actBulk("advance")}
                      >
                        Move {q.selected.length} to interview
                      </button>
                      <button
                        type="button"
                        className="wd-btn"
                        disabled={saving}
                        onClick={() => void actBulk("hold")}
                      >
                        Hold
                      </button>
                      <button
                        type="button"
                        className="wd-btn"
                        disabled={saving}
                        onClick={() => setAsking("bulk")}
                      >
                        Not a fit
                      </button>
                      <button
                        type="button"
                        className="wd-btn quiet"
                        disabled={saving}
                        onClick={() => setQ((p) => ({ ...p, selected: [] }))}
                      >
                        Clear
                      </button>
                    </>
                  )}
                  {holdUndo && (
                    <button
                      type="button"
                      className="wd-btn quiet"
                      disabled={saving}
                      onClick={() => void undoHold()}
                    >
                      Undo hold
                    </button>
                  )}
                  {saving && (
                    <span className="wd-small wd-muted" role="status">
                      Saving…
                    </span>
                  )}
                </>
              )}
            </div>
          )}
        </>
      ) : item ? (
        <FocusView
          name={item.name}
          headline={detailRow?.candidates?.current_role?.trim() || null}
          score={item.score}
          fallback={isFallbackScore(score?.scoring_method)}
          summary={agentSummary(detailRow?.one_line_summary)}
          summaryState={
            detail.loading && !detail.data ? "loading" : detail.error ? "error" : "ready"
          }
          rows={criteria}
          risks={riskList(score?.red_flags, score?.amber_flags)}
          probes={pack.verify.filter((v) => v.kind === "unevidenced-must-have").map((v) => v.quote)}
          facts={logistics({
            notice_period_days: row?.notice_period_days,
            expected_ctc_lpa: row?.expected_ctc_lpa,
            offers_in_hand: row?.offers_in_hand,
            location: row?.candidates?.location,
          })}
          position={position}
          profileHref={profileHref}
          requirementsUnavailable={requirementsUnavailable}
          decide={decideColumn}
        />
      ) : null}
    </div>
  );
}
