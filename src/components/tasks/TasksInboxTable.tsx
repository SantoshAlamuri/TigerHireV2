"use client";

import Link from "next/link";
import type { ActionableTask } from "@/lib/tasks/actionable-task-types";
import {
  TASK_ACTION_SHAPE_LABEL,
  TASK_CATEGORY_LABEL,
  TASK_ROW_ACTION_LABEL,
} from "@/lib/tasks/task-display";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusTone } from "@/lib/status-tones";

function jobHrefForTask(task: ActionableTask): string {
  const prefix = task.assignee_role === "hiring_manager" ? "/company" : "/recruit";
  return `${prefix}/jobs/${task.job_id}`;
}

function requisitionHrefForTask(task: ActionableTask): string {
  const prefix =
    task.assignee_role === "hiring_manager" || task.assignee_role === "leadership"
      ? "/company"
      : "/recruit";
  return `${prefix}/hiring-requests/${task.request_id}`;
}

const URGENCY_TONE: Record<string, StatusTone | null> = {
  overdue: "danger",
  due_today: "warning",
  upcoming: "info",
  normal: null,
};

type Props = {
  tasks: ActionableTask[];
  onDecide: (task: ActionableTask) => void;
  onOpen: (task: ActionableTask) => void;
};

export function TasksInboxTable({ tasks, onDecide, onOpen }: Props) {
  if (tasks.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] bg-white/[0.02] text-xs font-medium uppercase tracking-wide text-white/45">
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">What</th>
            <th className="px-4 py-3">In</th>
            <th className="px-4 py-3">Requested by</th>
            <th className="px-4 py-3">Note</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const tone = URGENCY_TONE[task.urgency];
            const shapeLabel =
              task.action_shape === "decide"
                ? TASK_ACTION_SHAPE_LABEL.decide
                : TASK_ACTION_SHAPE_LABEL.act;
            const isDecide = task.action_shape === "decide";
            const rowAction = () => (isDecide ? onDecide(task) : onOpen(task));
            const buttonLabel = isDecide ? TASK_ROW_ACTION_LABEL.decide : TASK_ROW_ACTION_LABEL.act;

            return (
              <tr
                key={task.id}
                className="cursor-pointer border-b border-[var(--border)]/60 last:border-0 hover:bg-white/[0.02]"
                onClick={rowAction}
              >
                <td className="px-4 py-3 align-top">
                  <div className="space-y-1">
                    <span className="font-medium text-[var(--text)]">
                      {task.type_label ?? TASK_CATEGORY_LABEL[task.category]}
                    </span>
                    <StatusBadge
                      tone={task.action_shape === "decide" ? "info" : "neutral"}
                      size="sm"
                    >
                      {shapeLabel}
                    </StatusBadge>
                    {tone ? (
                      <StatusBadge tone={tone} size="sm">
                        {task.urgency.replace("_", " ")}
                      </StatusBadge>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-[var(--text)]">
                    {task.subject_label ?? task.title}
                  </p>
                  {task.kind === "approval_requisition" && task.request_id ? (
                    <Link
                      href={requisitionHrefForTask(task)}
                      className="mt-0.5 block text-xs text-[var(--accent)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View requisition
                    </Link>
                  ) : null}
                  {task.job_id ? (
                    <Link
                      href={jobHrefForTask(task)}
                      className="mt-0.5 block text-xs text-[var(--accent)] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      View role
                    </Link>
                  ) : null}
                </td>
                <td className="max-w-[200px] px-4 py-3 align-top text-white/60">
                  {task.context_label ?? "—"}
                </td>
                <td className="px-4 py-3 align-top text-white/60">
                  {task.requested_by_name ?? "—"}
                </td>
                <td className="max-w-[220px] px-4 py-3 align-top text-xs text-white/50">
                  {task.comment_preview ? (
                    <span className="line-clamp-2" title={task.comment_preview}>
                      {task.comment_preview}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-3 align-top text-right">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      rowAction();
                    }}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black hover:opacity-90"
                  >
                    {buttonLabel}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
