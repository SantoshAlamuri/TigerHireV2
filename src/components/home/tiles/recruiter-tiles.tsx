"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function RcApplicationsTodayTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=rc-applications-today",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Applications today"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link
        href="/recruit/applications"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        Open applications
      </Link>
    </HomeTileCard>
  );
}

export function RcPipelineRowsTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=rc-pipeline-rows",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Active pipeline rows"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/recruit/pipeline" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Pipeline
      </Link>
    </HomeTileCard>
  );
}

export function RcJobsOpenTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=rc-jobs-open",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Open job postings"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/recruit/jobs" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Manage jobs
      </Link>
    </HomeTileCard>
  );
}

export function RcStalePipelineTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=rc-stale-pipeline",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Stale pipeline (7+ days)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
      emptyLabel="No stale pipeline rows"
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/recruit/pipeline" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        Review pipeline
      </Link>
    </HomeTileCard>
  );
}
