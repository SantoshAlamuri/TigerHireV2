"use client";

import { useReviewWorkspace } from "@/lib/v2/use-review-workspace";
import { useWorkspaceScroll } from "@/lib/v2/use-workspace-scroll";
import { isDisplayableEvidence } from "@/lib/v2/evidence-pack";

import { useCallback, useRef, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  decide,
  toggleSelect,
  bulkDecide,
  remaining,
  currentItem,
  lastHoldUndoIds,
  undoLast,
  type Decision,
  type QueueItem,
} from "@/lib/v2/review-queue";
import { RejectReasonMenu } from "./RejectReasonMenu";
import { EvidenceColumns } from "./EvidenceColumns";
import { QueueList, BulkBar } from "./QueueList";
import { useReviewKeys } from "./useReviewKeys";
import { ReviewNotYours, QueueCleared } from "./ReviewStates";
import { useEvidencePack, type ReviewAppRow } from "./useEvidencePack";
import { flagPips, type FlagPips } from "@/lib/v2/score-panel";
import { useScorePanels } from "./useScorePanels";
import { Logistics } from "./Logistics";
import { ScoreTriple } from "./ScoreTriple";
import { useReviewData, type JobScore } from "./useReviewData";
import { useDecisionSync } from "./useDecisionSync";
import { useAuth } from "@/lib/auth/AuthProvider";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import { SeatGate } from "../../../SeatGate";
import { ComparisonSnapshot } from "./ComparisonSnapshot";

function DecisionSnapshot({
  candidateName,
  pack,
}: {
  candidateName: string;
  pack: ReturnType<typeof useEvidencePack>;
}) {
  if (pack.isEmpty)
    return <p className="mb-4 text-sm text-[var(--text)]">No verified resume evidence available</p>;
  const lead =
    pack.counts.for > pack.counts.against && pack.counts.for > 0
      ? `${candidateName} has more supporting evidence than gaps.`
      : pack.counts.against > pack.counts.for
        ? `${candidateName} needs careful review before moving forward.`
        : `${candidateName} has a mixed signal.`;
  const bestFor = pack.for.find((item) => item.kind === "quote")?.quote;
  const mainRisk = pack.against[0]?.quote ?? pack.verify[0]?.quote;

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-[var(--text)]">{lead}</p>
        <span className="ml-auto rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-300">
          {pack.counts.for} for
        </span>
        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
          {pack.counts.verify} check
        </span>
        <span className="rounded-full bg-red-500/10 px-2 py-1 text-xs font-medium text-red-300">
          {pack.counts.against} gaps
        </span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {bestFor ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            <span className="font-semibold text-emerald-200">Best evidence:</span> {bestFor}
          </p>
        ) : (
          <p className="text-xs text-[var(--text-muted)]">No verified resume evidence available</p>
        )}
        {mainRisk ? (
          <p className="text-xs leading-relaxed text-[var(--text-muted)]">
            <span className="font-semibold text-amber-200">Main thing to check:</span> {mainRisk}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type EvidencePipsInput = Parameters<typeof flagPips>[0] & {
  evidenceJson?: JobScore["evidence_json"];
};

function evidencePipsForScore(score: EvidencePipsInput): FlagPips {
  const pips = flagPips(score);
  const quotes = new Set(
    score.evidenceJson?.quotes
      ?.map((item) => item.quote?.trim().toLowerCase().replace(/\s+/g, " "))
      .filter((quote): quote is string => isDisplayableEvidence(quote)) ?? [],
  );
  return { ...pips, green: pips.green + quotes.size };
}

/**
 * Application Review — clear the queue one keystroke at a time.
 *
 * All queue rules live in @/lib/v2/review-queue (unit-tested); this file only
 * renders them and binds keys. Decisions ARE written to the database: each
 * one PATCHes its application status, and anything the server rejects is
 * surfaced in a banner rather than silently swallowed while the queue moves on.
 */
function RecruitV2ReviewPageBody() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const requestedApplication = searchParams.get("applicationId");
  const { data, loading, error, refetch, mustHaves, scoresByCandidate, requirementsUnavailable } =
    useReviewData(id);

  const queueItems: QueueItem[] = useMemo(() => {
    const rows = data?.applications ?? [];
    return rows
      .map((a) => ({
        id: a.id,
        name: a.candidates?.name?.trim() || "Unknown candidate",
        score: scoresByCandidate.get(a.candidate_id)?.overall_score ?? null,
      }))
      .sort((x, y) => (y.score ?? -1) - (x.score ?? -1));
  }, [data, scoresByCandidate]);

  const workspaceKey = `tigerhire.review:${user?.id ?? "anonymous"}:${id}`;
  const [q, setQ] = useReviewWorkspace(queueItems, workspaceKey, requestedApplication);
  useWorkspaceScroll(workspaceKey, !loading && !error);
  const [askReason, setAskReason] = useState(false);
  const [saving, setSaving] = useState(false);
  const actionLock = useRef(false);

  const item = currentItem(q);
  const left = remaining(q);

  const rowsById = useMemo(() => {
    const m = new Map<string, ReviewAppRow>();
    for (const a of data?.applications ?? []) m.set(a.id, a);
    return m;
  }, [data]);

  const currentRow = item ? rowsById.get(item.id) : undefined;
  const currentScore = currentRow?.candidate_id
    ? scoresByCandidate.get(currentRow.candidate_id)
    : undefined;
  const pack = useEvidencePack(currentRow, mustHaves, currentScore);

  const { panelFor, scores } = useScorePanels(rowsById, scoresByCandidate, item?.id);

  const { persist, restoreHold, failed } = useDecisionSync(id);
  const caps = capabilitiesFor(user?.role);
  const holdUndoIds = lastHoldUndoIds(q);

  const applyBulk = useCallback(
    async (d: Decision, reason?: string) => {
      if (actionLock.current) return;
      let proposal;
      try {
        proposal = bulkDecide(q, d, reason);
      } catch {
        return;
      }
      const ids = proposal.decisions
        .filter((row) => !q.decisions.some((old) => old.id === row.id))
        .map((row) => row.id);
      if (!ids.length) return;
      actionLock.current = true;
      setSaving(true);
      try {
        const saved = await Promise.all(
          ids.map(async (id) => ((await persist(id, d, reason)) ? id : null)),
        );
        const accepted = saved.filter((id): id is string => id !== null);
        setQ((previous) => ({
          ...bulkDecide({ ...previous, selected: accepted }, d, reason),
          selected: previous.selected.filter((id) => !accepted.includes(id)),
        }));
      } finally {
        actionLock.current = false;
        setSaving(false);
      }
    },
    [persist, q],
  );

  const act = useCallback(
    async (d: Decision, reason?: string) => {
      if (actionLock.current) return;
      const target = currentItem(q);
      if (!target || q.decisions.some((row) => row.id === target.id)) return;
      try {
        decide(q, d, reason);
      } catch {
        return;
      }
      actionLock.current = true;
      setSaving(true);
      try {
        if (await persist(target.id, d, reason)) {
          setQ((previous) =>
            decide(
              { ...previous, cursor: previous.items.findIndex((row) => row.id === target.id) },
              d,
              reason,
            ),
          );
        }
      } finally {
        actionLock.current = false;
        setSaving(false);
      }
    },
    [persist, q],
  );

  const undoHold = useCallback(async () => {
    if (actionLock.current) return;
    const ids = lastHoldUndoIds(q);
    if (!ids?.length) return;
    actionLock.current = true;
    setSaving(true);
    try {
      const saved = await Promise.all(ids.map(async (id) => ((await restoreHold(id)) ? id : null)));
      if (saved.every(Boolean)) setQ(undoLast);
    } finally {
      actionLock.current = false;
      setSaving(false);
    }
  }, [q, restoreHold, setQ]);

  useReviewKeys({ askReason, setAskReason, act, setQ, disabled: saving, undoHold });

  if (!id) return null;
  if (!caps.reviewApplications) return <ReviewNotYours />;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Application Review</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {loading
              ? "Loading…"
              : `${left} of ${q.items.length} in this batch · ${Math.max(0, (data?.pagination?.total ?? q.items.length) - q.decisions.length)} awaiting review`}
          </p>
        </div>
        <Link
          href={`/recruit/jobs/${id}`}
          className="text-sm font-semibold text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← Job
        </Link>
      </div>

      {failed.length > 0 ? (
        <p className="mb-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-xs text-red-200">
          {failed.length} decision{failed.length === 1 ? "" : "s"} could not be saved and still need
          attention. Unsaved candidates remain in this queue; retry the decision.
        </p>
      ) : null}

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : error ? (
        <div role="alert">
          <p>Could not load candidates.</p>
          <button onClick={() => void refetch()}>Retry</button>
        </div>
      ) : !item || left === 0 ? (
        <div>
          <QueueCleared total={q.items.length} decisions={q.decisions} />
          {holdUndoIds ? (
            <button
              type="button"
              onClick={() => void undoHold()}
              className="mt-3 mr-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
            >
              Undo hold
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
          >
            {(data?.pagination?.total ?? 0) > q.items.length
              ? "Review next candidates"
              : "Check for new candidates"}
          </button>
        </div>
      ) : (
        <>
          <details className="mb-3 rounded-lg border border-[var(--border)] p-3">
            <summary className="cursor-pointer text-sm font-semibold">Compare candidates</summary>
            <ComparisonSnapshot
              rowsById={rowsById}
              queueOrder={q.items}
              scoresByCandidate={scoresByCandidate}
            />
          </details>

          <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
            <QueueList
              items={q.items}
              cursor={q.cursor}
              decidedIds={q.decisions.map((d) => d.id)}
              selected={q.selected}
              onOpen={(itemId) =>
                setQ((p) => ({ ...p, cursor: p.items.findIndex((row) => row.id === itemId) }))
              }
              onToggle={(itemId) => {
                if (!saving) setQ((p) => toggleSelect(p, itemId));
              }}
              pipsFor={(rowId) => {
                const input = panelFor(rowId);
                const candidateId = rowId ? rowsById.get(rowId)?.candidate_id : undefined;
                const score = candidateId ? scoresByCandidate.get(candidateId) : undefined;
                return evidencePipsForScore({ ...input, evidenceJson: score?.evidence_json });
              }}
            />

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-5">
              <fieldset disabled={saving} className="min-w-0">
                <label className="mb-3 block text-sm lg:hidden">
                  Candidate
                  <select
                    aria-label="Review candidate"
                    value={item.id}
                    onChange={(event) =>
                      setQ((previous) => ({
                        ...previous,
                        cursor: previous.items.findIndex((row) => row.id === event.target.value),
                      }))
                    }
                    className="mt-1 min-h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]"
                  >
                    {q.items.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                        {q.decisions.some((decision) => decision.id === row.id)
                          ? " · reviewed"
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <BulkBar
                  count={q.selected.length}
                  onAdvance={() => applyBulk("advance")}
                  onHold={() => applyBulk("hold")}
                  onReject={() => setAskReason(true)}
                  onClear={() => setQ((p) => ({ ...p, selected: [] }))}
                />
                <div className="flex flex-wrap items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold text-[var(--text)]">{item.name}</h2>
                    {currentScore?.scoring_method === "deterministic_fallback" && (
                      <p className="mt-1 text-sm text-amber-300">
                        Keyword fallback — review the evidence
                      </p>
                    )}
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
                      <span>
                        Candidate {q.cursor + 1} of {q.items.length}
                      </span>
                      {currentRow?.candidate_id ? (
                        <Link
                          href={`/recruit/candidates/${currentRow.candidate_id}?applicationId=${encodeURIComponent(item.id)}&jobId=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(`/recruit/v2/jobs/${id}/review?applicationId=${item.id}`)}`}
                          className="font-semibold text-[var(--accent)] hover:underline"
                        >
                          Open full profile
                        </Link>
                      ) : null}
                    </div>
                  </div>
                  <ScoreTriple panel={scores} />
                </div>

                <div className="sticky top-0 z-20 mt-4 border-t border-[var(--border)] bg-[var(--surface)] py-3">
                  {askReason ? (
                    <RejectReasonMenu
                      count={q.selected.length || 1}
                      onCancel={() => setAskReason(false)}
                      onPick={(reasonId) => {
                        if (q.selected.length > 0) applyBulk("reject", reasonId);
                        else act("reject", reasonId);
                        setAskReason(false);
                      }}
                    />
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => act("advance")}
                        className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black"
                      >
                        Shortlist <span className="ml-1 font-mono text-xs opacity-70">A</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => act("hold")}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
                      >
                        Hold <span className="ml-1 font-mono text-xs opacity-60">H</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setAskReason(true)}
                        className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text-muted)]"
                      >
                        Reject <span className="ml-1 font-mono text-xs opacity-60">R</span>
                      </button>
                      {holdUndoIds ? (
                        <button
                          type="button"
                          onClick={() => void undoHold()}
                          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--text)]"
                        >
                          Undo hold
                          <span className="ml-1 font-mono text-xs opacity-60">U</span>
                        </button>
                      ) : null}
                      <span className="ml-auto text-xs text-[var(--text-muted)]">
                        {saving ? "Saving decision…" : "J / K to move"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4">
                  {requirementsUnavailable && (
                    <p role="status" className="mb-2 text-sm text-amber-300">
                      Hiring requirements could not be loaded. Missing-requirement checks are
                      unavailable.
                    </p>
                  )}
                  <DecisionSnapshot candidateName={item.name} pack={pack} />
                  {!pack.isEmpty && <EvidenceColumns pack={pack} />}
                </div>

                <Logistics row={item ? rowsById.get(item.id) : undefined} />
              </fieldset>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function RecruitV2ReviewPage() {
  return (
    <SeatGate need="reviewApplications" what="The applicant review queue">
      <RecruitV2ReviewPageBody />
    </SeatGate>
  );
}
