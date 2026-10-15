export default function DashboardLoading() {
  return (
    <div className="space-y-4 bg-[var(--bg)] p-6" aria-busy="true" aria-live="polite">
      <div className="h-24 animate-pulse card-lifted" />
      <div className="grid gap-4 md:grid-cols-3">
        <div className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
        <div className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
        <div className="h-32 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
    </div>
  );
}
