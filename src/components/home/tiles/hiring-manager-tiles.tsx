"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function HmOwnedJobsTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=hm-owned-jobs",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard title="Roles I own" loading={loading} error={errMsg} empty={Boolean(data?.empty)}>
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link href="/company/my-jobs" className="mt-2 text-sm text-[var(--accent)] hover:underline">
        My jobs
      </Link>
    </HomeTileCard>
  );
}

export function HmPipelineAwaitingTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=hm-pipeline-awaiting",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Pipeline candidates (active)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link
        href="/company/my-pipeline"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        My pipeline
      </Link>
    </HomeTileCard>
  );
}

export function HmHiringRequestsTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=hm-hiring-requests",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="My hiring requests"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link
        href="/company/hiring-requests"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        Hiring requests
      </Link>
    </HomeTileCard>
  );
}
