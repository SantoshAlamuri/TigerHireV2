"use client";

import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import type { StageActivityItem } from "@/lib/recruitment-plan/stage-candidate-activity";

const TYPE_LABEL: Record<StageActivityItem["activity_type"], string> = {
  whatsapp_comms: "WhatsApp",
  slot_picker: "Slot picker",
  screening: "Screening",
  offer: "Offer",
  plan_event: "Automation",
  human_move: "Pipeline move",
  human_decision: "Decision",
  referrer: "Referrer",
};

export function PlanStageActivityPanel({ jobId }: { jobId: string }) {
  const { data, loading, error } = useApiQuery<{ activity: StageActivityItem[] }>(
    `/api/jobs/${jobId}/plan/activity`,
  );

  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error) return <p className="text-sm text-red-400">{error}</p>;

  const activity = data?.activity ?? [];
  if (activity.length === 0) {
    return <p className="text-sm text-white/50">No recent candidate activity on this role yet.</p>;
  }

  return (
    <ul className="card-lifted divide-y divide-[var(--border)]">
      {activity.slice(0, 12).map((row) => (
        <li key={row.id} className="px-4 py-3">
          <p className="text-sm text-[var(--text)]">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--accent)]">
              {TYPE_LABEL[row.activity_type]}
            </span>
            {" · "}
            {row.candidate_name}
          </p>
          <p className="mt-0.5 text-xs text-white/55">{row.summary}</p>
          {row.actor_label ? (
            <p className="mt-0.5 text-xs text-white/45">By {row.actor_label}</p>
          ) : null}
          {row.referrer_name ? (
            <p className="mt-0.5 text-xs text-white/45">Referred by {row.referrer_name}</p>
          ) : null}
          <p className="mt-0.5 text-[11px] text-white/35">
            {new Date(row.occurred_at).toLocaleString()}
          </p>
        </li>
      ))}
    </ul>
  );
}
