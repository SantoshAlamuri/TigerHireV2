"use client";

import { useState, useCallback } from "react";
import { Clock, MessageSquare, Loader2, CheckSquare, Square } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { BookSlotButton } from "./BookSlotButton";
import { AddSlotsForm } from "./AddSlotsForm";
import { FeedbackViewButton } from "./FeedbackViewButton";
import { FeedbackSubmitButton } from "./FeedbackSubmitButton";
import { formatDisplayDateTime } from "@/lib/locale/display";

type PipelineCandidate = {
  id: string;
  job_id: string;
  candidate_id: string;
  stage_id?: string | null;
  candidates?: { name: string | null };
};

type Slot = { id: string; start_at: string; end_at: string; status: string };

type FeedbackTemplate = { id: string; name: string; fields: unknown[] };

type PipelineStage = {
  id: string;
  stage_name: string;
  stage_order: number;
  feedback_template_id?: string | null;
};

export function JobOverviewSections({
  jobId,
  pipelineCandidatesForJob,
  availableSlots,
  refetchAvailability,
  feedbackTemplates,
  refetchTemplates,
  refetchPipeline,
  refetchScores,
}: {
  jobId: string;
  pipelineCandidatesForJob: PipelineCandidate[];
  availableSlots: Slot[];
  refetchAvailability: () => Promise<unknown>;
  feedbackTemplates: FeedbackTemplate[];
  refetchTemplates: () => Promise<unknown>;
  refetchPipeline: () => Promise<unknown>;
  refetchScores: () => Promise<unknown>;
}) {
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkMoveStageId, setBulkMoveStageId] = useState<string>("");

  const { data: stagesData } = useApiQuery<{ stages: PipelineStage[] }>(
    jobId ? `/api/jobs/${jobId}/pipeline-stages` : null,
  );
  const stages = stagesData?.stages ?? [];

  const toggleBulkSelect = useCallback((pcId: string) => {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(pcId)) next.delete(pcId);
      else next.add(pcId);
      return next;
    });
  }, []);

  const selectAllBulk = useCallback(() => {
    if (bulkSelected.size === pipelineCandidatesForJob.length) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(pipelineCandidatesForJob.map((pc) => pc.id)));
    }
  }, [pipelineCandidatesForJob, bulkSelected.size]);

  const runBulkAction = useCallback(
    async (action: "shortlist" | "reject" | "move_stage") => {
      const ids = Array.from(bulkSelected);
      if (ids.length === 0) return;
      if (action === "move_stage" && !bulkMoveStageId) return;
      setBulkActionLoading(true);
      try {
        const res = await fetch(`/api/jobs/${jobId}/pipeline/bulk`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            action,
            candidateIds: ids,
            ...(action === "move_stage" ? { stageId: bulkMoveStageId } : {}),
          }),
        });
        if (res.ok) {
          setBulkSelected(new Set());
          setBulkMoveStageId("");
          await refetchPipeline();
          await refetchScores();
        }
      } finally {
        setBulkActionLoading(false);
      }
    },
    [jobId, bulkSelected, bulkMoveStageId, refetchPipeline, refetchScores],
  );

  return (
    <>
      <section className="mt-8">
        <h2 className="heading-section mb-4 flex items-center gap-2 text-lg text-[var(--text)]">
          <Clock size={20} className="text-[var(--accent)]" />
          Interview scheduling
        </h2>
        <div className="card-lifted p-5 backdrop-blur-md">
          <p className="text-body mb-4 text-sm text-white/60">
            Add availability slots and book interviews for pipeline candidates. For the full
            calendar view, open{" "}
            <a
              href={`/recruit/jobs/${jobId}/interviews`}
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Interviews
            </a>
            .
          </p>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="heading-card mb-2 text-sm text-[var(--text)]">Available slots</h3>
              {availableSlots.length === 0 ? (
                <p className="text-body text-sm text-white/60">
                  No slots in the next 14 days. Add slots below.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {availableSlots.slice(0, 10).map((slot) => (
                    <li
                      key={slot.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                    >
                      <span className="text-[var(--text)]">
                        {formatDisplayDateTime(slot.start_at)}
                      </span>
                      {pipelineCandidatesForJob.length > 0 && (
                        <BookSlotButton
                          jobId={jobId}
                          slotId={slot.id}
                          pipelineCandidates={pipelineCandidatesForJob}
                          onBooked={refetchAvailability}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="heading-card mb-2 text-sm text-[var(--text)]">Add slots</h3>
              <AddSlotsForm jobId={jobId} onAdded={refetchAvailability} />
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="heading-section mb-4 flex items-center gap-2 text-lg text-[var(--text)]">
          <MessageSquare size={20} className="text-[var(--accent)]" />
          Interview feedback
        </h2>
        <div className="card-lifted p-5 backdrop-blur-md">
          <p className="mb-4 text-sm text-white/60">
            Feedback templates and stage-to-template attachment are managed in{" "}
            <a
              href={`/recruit/jobs/${jobId}/pipeline-stages`}
              className="font-medium text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Hiring setup
            </a>
            .
          </p>
          {pipelineCandidatesForJob.length > 0 && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="heading-card text-sm text-[var(--text)]">Feedback by candidate</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllBulk}
                    className="text-xs font-medium text-[var(--accent)] hover:underline"
                  >
                    {bulkSelected.size === pipelineCandidatesForJob.length ? "Clear" : "Select all"}
                  </button>
                  {bulkSelected.size > 0 && (
                    <span className="text-xs text-white/60">{bulkSelected.size} selected</span>
                  )}
                </div>
              </div>
              {bulkSelected.size > 0 && (
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
                  <button
                    type="button"
                    disabled={bulkActionLoading}
                    onClick={() => runBulkAction("shortlist")}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bulkActionLoading ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      "Shortlist"
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={bulkActionLoading}
                    onClick={() => runBulkAction("reject")}
                    className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject
                  </button>
                  {stages.length > 0 && (
                    <>
                      <select
                        value={bulkMoveStageId}
                        onChange={(e) => setBulkMoveStageId(e.target.value)}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-xs text-[var(--text)]"
                      >
                        <option value="">Move to stage…</option>
                        {stages
                          .toSorted((a, b) => a.stage_order - b.stage_order)
                          .map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.stage_name}
                            </option>
                          ))}
                      </select>
                      <button
                        type="button"
                        disabled={bulkActionLoading || !bulkMoveStageId}
                        onClick={() => runBulkAction("move_stage")}
                        className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Move
                      </button>
                    </>
                  )}
                </div>
              )}
              <ul className="space-y-2">
                {pipelineCandidatesForJob.map((pc) => (
                  <li
                    key={pc.id}
                    className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                  >
                    <button
                      type="button"
                      onClick={() => toggleBulkSelect(pc.id)}
                      className="flex shrink-0 text-white/60 hover:text-[var(--text)]"
                      aria-label={bulkSelected.has(pc.id) ? "Deselect" : "Select"}
                    >
                      {bulkSelected.has(pc.id) ? (
                        <CheckSquare size={18} className="text-[var(--accent)]" />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                    <span className="min-w-0 flex-1 text-sm text-[var(--text)]">
                      {pc.candidates?.name ?? "Candidate"}
                    </span>
                    <div className="flex shrink-0 gap-2">
                      <FeedbackViewButton jobId={jobId} pipelineCandidateId={pc.id} />
                      <FeedbackSubmitButton
                        jobId={jobId}
                        pipelineCandidateId={pc.id}
                        candidateName={pc.candidates?.name ?? "Candidate"}
                        defaultTemplateId={
                          (pc.stage_id
                            ? stages.find((stage) => stage.id === pc.stage_id)?.feedback_template_id
                            : undefined) ?? undefined
                        }
                        templates={feedbackTemplates}
                        onSubmitted={refetchTemplates}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
