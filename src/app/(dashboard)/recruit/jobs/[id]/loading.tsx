export default function RecruitJobDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-72 animate-pulse card-lifted" />
      <div className="h-24 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-52 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
        <div className="h-52 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
      </div>
    </div>
  );
}
