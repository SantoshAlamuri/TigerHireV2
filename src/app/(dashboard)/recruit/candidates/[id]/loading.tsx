export default function RecruitCandidateDetailLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-64 animate-pulse card-lifted" />
      <div className="h-20 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
      <div className="h-64 animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface)]/50" />
    </div>
  );
}
