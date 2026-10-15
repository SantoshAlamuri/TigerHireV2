"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { HomeTileCard } from "../HomeTileCard";

function usePlanTileEnabled() {
  return isPlanDocumentUiEnabled();
}

export function PdHiringVelocityTile() {
  const on = usePlanTileEnabled();
  const { data, loading, error } = useApiQuery<{ avgDays: number | null; planCount: number }>(
    on ? "/api/home/tiles?tile=pd-hiring-velocity" : null,
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Hiring velocity"
      loading={loading}
      error={errMsg}
      empty={!data?.avgDays && (data?.planCount ?? 0) === 0}
      emptyLabel="No active plans yet"
    >
      <p className="text-2xl font-semibold text-[var(--text)]">
        {data?.avgDays != null ? `${Math.round(data.avgDays)}d` : "—"}
      </p>
      <p className="text-xs text-[var(--text-muted)]">Avg elapsed on active plans</p>
    </HomeTileCard>
  );
}

export function PdPipelineHealthTile() {
  const on = usePlanTileEnabled();
  const { data, loading, error } = useApiQuery<{
    stages: Array<{ stage: string; count: number }>;
    empty: boolean;
  }>(on ? "/api/home/tiles?tile=pd-pipeline-health" : null);
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Pipeline health"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <ul className="space-y-1 text-sm text-[var(--text)]">
        {(data?.stages ?? []).slice(0, 4).map((row) => (
          <li key={row.stage} className="flex justify-between gap-2">
            <span className="truncate text-[var(--text-muted)]">{row.stage}</span>
            <span className="font-semibold">{row.count}</span>
          </li>
        ))}
      </ul>
      <Link href="/recruit/pipeline" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Open pipeline
      </Link>
    </HomeTileCard>
  );
}

export function PdPendingActionsTile() {
  const on = usePlanTileEnabled();
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    on ? "/api/home/tiles?tile=pd-pending-actions" : null,
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Pending actions"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <p className="text-xs text-[var(--text-muted)]">Items awaiting you</p>
      <Link href="/tasks" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        View tasks
      </Link>
    </HomeTileCard>
  );
}

export function PdTimeToHireTile() {
  const on = usePlanTileEnabled();
  const { data, loading, error } = useApiQuery<{
    weeks: Array<{ label: string; days: number | null }>;
    empty: boolean;
  }>(on ? "/api/home/tiles?tile=pd-time-to-hire" : null);
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  const max = Math.max(...(data?.weeks ?? []).map((w) => w.days ?? 0), 1);
  return (
    <HomeTileCard
      title="Time to hire (4 weeks)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <div className="flex h-16 items-end gap-2">
        {(data?.weeks ?? []).map((w) => (
          <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
            <div
              className="w-full rounded-t bg-[var(--accent)]/70"
              style={{ height: `${((w.days ?? 0) / max) * 100}%`, minHeight: w.days ? 4 : 2 }}
              title={w.days != null ? `${w.days}d` : "No hires"}
            />
            <span className="text-[10px] text-[var(--text-muted)]">{w.label}</span>
          </div>
        ))}
      </div>
    </HomeTileCard>
  );
}
