"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { HomeTileCard } from "../HomeTileCard";

export function IvUpcomingTile() {
  const { data, loading, error } = useApiQuery<{ count: number; empty: boolean }>(
    "/api/home/tiles?tile=iv-upcoming",
  );
  const errMsg = error ?? (data == null && !loading ? "Could not load this tile" : null);
  return (
    <HomeTileCard
      title="Upcoming interviews (7 days)"
      loading={loading}
      error={errMsg}
      empty={Boolean(data?.empty)}
    >
      <p className="text-2xl font-semibold text-[var(--text)]">{data?.count ?? 0}</p>
      <Link
        href="/company/interviews"
        className="mt-2 text-sm text-[var(--accent)] hover:underline"
      >
        Interviews
      </Link>
    </HomeTileCard>
  );
}
