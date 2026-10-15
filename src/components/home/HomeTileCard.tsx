"use client";

import type { ReactNode } from "react";

type HomeTileCardProps = {
  title: string;
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel?: string;
  children: ReactNode;
};

export function HomeTileCard({
  title,
  loading,
  error,
  empty,
  emptyLabel = "Nothing here yet",
  children,
}: HomeTileCardProps) {
  return (
    <section className="flex min-h-[140px] flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4 shadow-sm">
      <h2 className="mb-2 text-sm font-semibold text-[var(--text)]">{title}</h2>
      {loading ? (
        <div className="flex flex-1 flex-col gap-2" aria-busy="true" aria-label="Loading">
          <div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface)]" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-[var(--surface)]" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : empty ? (
        <p className="text-sm text-[var(--text-muted)]">{emptyLabel}</p>
      ) : (
        children
      )}
    </section>
  );
}
