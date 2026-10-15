"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";
import { externalHrefForActionableTask } from "@/lib/tasks/actionable-task-external-href";

type Member = { id: string; full_name: string | null; email: string | null };

type PanelProps = {
  task: ActionableTask;
  onCompleted: () => void;
};

function parseSlotPickerRequestId(taskId: string): string | null {
  if (!taskId.startsWith("slot:")) return null;
  return taskId.slice(5);
}

function parsePlanStageId(taskId: string): string | null {
  if (taskId.startsWith("plan-iv:")) return taskId.slice(8);
  return null;
}

function parsePipelineCandidateId(taskId: string): string | null {
  if (taskId.startsWith("iv:")) return taskId.slice(3);
  return null;
}

function parseDwellDays(task: ActionableTask): number | null {
  if (task.dwell_days != null) return task.dwell_days;
  const match = task.comment_preview?.match(/\((\d+)d\)/);
  return match ? Number(match[1]) : null;
}

export function FeedbackTaskPanel({ task }: PanelProps) {
  const externalHref = externalHrefForActionableTask(task);
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        Submit scorecard feedback for this interview. Your notes help move the candidate forward in
        the pipeline.
      </p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-white/45">Candidate</dt>
          <dd className="text-white/75">{task.subject_label ?? "—"}</dd>
        </div>
        {task.pipeline_stage_name ? (
          <div>
            <dt className="text-xs text-white/45">Stage</dt>
            <dd className="text-white/75">{task.pipeline_stage_name}</dd>
          </div>
        ) : null}
      </dl>
      <Link
        href={externalHref}
        className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black"
      >
        Open scorecard
      </Link>
    </div>
  );
}

export function SlotPickerTaskPanel({ task, onCompleted }: PanelProps) {
  const requestId = parseSlotPickerRequestId(task.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleResend = useCallback(async () => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/slot-picker/${encodeURIComponent(requestId)}/resend`, {
        method: "POST",
        credentials: "include",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Resend failed");
        return;
      }
      setSent(true);
      onCompleted();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }, [requestId, onCompleted]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        WhatsApp slot picker was sent to the candidate. Resend if they have not responded.
      </p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-white/45">Candidate</dt>
          <dd className="text-white/75">{task.subject_label ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-white/45">Status</dt>
          <dd className="text-white/75">Awaiting candidate response</dd>
        </div>
      </dl>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {sent ? <p className="text-sm text-emerald-400">Slot picker resent.</p> : null}
      <button
        type="button"
        disabled={loading || !requestId}
        onClick={() => void handleResend()}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Resend slot picker
      </button>
    </div>
  );
}

export function InterviewerAssignmentPanel({ task, onCompleted }: PanelProps) {
  const planStageId = parsePlanStageId(task.id);
  const pipelineCandidateId = parsePipelineCandidateId(task.id);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/organisations/members", { credentials: "include" });
        const json = (await res.json()) as { members?: Member[] };
        if (!cancelled && res.ok) {
          setMembers(json.members ?? []);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!task.job_id || !selected || (!planStageId && !pipelineCandidateId)) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks/plan-stage-interviewer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          jobId: task.job_id,
          ...(planStageId ? { planStageId } : {}),
          ...(pipelineCandidateId ? { pipelineCandidateId } : {}),
          primaryInterviewerId: selected,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        return;
      }
      onCompleted();
    } catch {
      setError("Request failed");
    } finally {
      setLoading(false);
    }
  }, [task.job_id, planStageId, pipelineCandidateId, selected, onCompleted]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        Assign a primary interviewer for this interview stage on the recruitment plan.
      </p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-white/45">Stage</dt>
          <dd className="text-white/75">{task.pipeline_stage_name ?? task.subject_label ?? "—"}</dd>
        </div>
      </dl>
      <label className="block text-xs text-white/50">
        Primary interviewer
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-[var(--text)]"
        >
          <option value="">Select interviewer…</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {(m.full_name ?? m.email ?? m.id).trim()}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      <button
        type="button"
        disabled={loading || !selected || (!planStageId && !pipelineCandidateId)}
        onClick={() => void handleSave()}
        className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        Save assignment
      </button>
    </div>
  );
}

export function PlanExceptionPanel({ task }: PanelProps) {
  const dwell = parseDwellDays(task);
  const pipelineHref = task.job_id
    ? `/recruit/pipeline?jobId=${encodeURIComponent(task.job_id)}`
    : externalHrefForActionableTask(task);

  return (
    <div className="space-y-4">
      <p className="text-sm text-white/55">
        This candidate has exceeded target dwell time in a plan stage. Move them in the pipeline or
        complete the next step.
      </p>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-white/45">Candidate</dt>
          <dd className="text-white/75">{task.subject_label ?? "—"}</dd>
        </div>
        {dwell != null ? (
          <div>
            <dt className="text-xs text-white/45">Time in stage</dt>
            <dd className="text-white/75">{dwell} days</dd>
          </div>
        ) : null}
        {task.pipeline_stage_name ? (
          <div>
            <dt className="text-xs text-white/45">Plan stage</dt>
            <dd className="text-white/75">{task.pipeline_stage_name}</dd>
          </div>
        ) : null}
      </dl>
      <Link
        href={pipelineHref}
        className="inline-flex rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black"
      >
        Open in pipeline
      </Link>
    </div>
  );
}

export function TaskActPanelRouter(props: PanelProps) {
  switch (props.task.kind) {
    case "feedback":
      return <FeedbackTaskPanel {...props} />;
    case "slot_picker":
      return <SlotPickerTaskPanel {...props} />;
    case "interviewer_assignment":
      return <InterviewerAssignmentPanel {...props} />;
    case "plan_exception":
      return <PlanExceptionPanel {...props} />;
    default:
      return null;
  }
}
