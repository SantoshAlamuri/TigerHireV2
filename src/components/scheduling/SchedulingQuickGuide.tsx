import Link from "next/link";
import { CalendarPlus, Link2, Mail } from "lucide-react";
import { SELF_SERVE_CANDIDATE_WINDOW_DAYS } from "@/lib/interviews/self-serve-slot-window";

type SchedulingQuickGuideProps = {
  jobId: string;
  availableSlotCount: number;
  onCreateSlots: () => void;
  onCopyJobLink: () => void;
  copyJobLinkLoading: boolean;
};

/**
 * Short recruiter-facing steps for interview scheduling (slots → invite → auto calendar invite).
 */
export function SchedulingQuickGuide({
  jobId,
  availableSlotCount,
  onCreateSlots,
  onCopyJobLink,
  copyJobLinkLoading,
}: SchedulingQuickGuideProps) {
  const pipelineHref = `/recruit/pipeline?jobId=${encodeURIComponent(jobId)}`;

  return (
    <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 px-4 py-4">
      <h3 className="text-sm font-semibold text-[var(--text)]">How scheduling works</h3>
      <ol className="mt-3 space-y-3 text-sm text-white/70">
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
            1
          </span>
          <span>
            <strong className="text-[var(--text)]">Add open times</strong> — candidates can only
            book slots you publish here.
            {availableSlotCount === 0 ? (
              <span className="mt-1 block text-amber-300/90">No open slots yet.</span>
            ) : (
              <span className="mt-1 block text-emerald-300/90">
                {availableSlotCount} open slot{availableSlotCount === 1 ? "" : "s"} ready.
              </span>
            )}
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
            2
          </span>
          <span>
            <strong className="text-[var(--text)]">Invite the candidate</strong> — easiest from{" "}
            <Link href={pipelineHref} className="font-medium text-[var(--accent)] hover:underline">
              Pipeline
            </Link>
            : menu → <em>Send scheduling link</em> (email). Or copy a job-wide link below if you
            will send it yourself.
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-xs font-bold text-[var(--accent)]">
            3
          </span>
          <span>
            <strong className="text-[var(--text)]">They pick a time</strong> — only in the next{" "}
            {SELF_SERVE_CANDIDATE_WINDOW_DAYS} days (today included). Calendar invites go out
            automatically after booking (email + optional WhatsApp).
          </span>
        </li>
      </ol>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <button
          type="button"
          onClick={onCreateSlots}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
        >
          <CalendarPlus className="h-4 w-4" />
          Create slots
        </button>
        <button
          type="button"
          onClick={onCopyJobLink}
          disabled={copyJobLinkLoading || availableSlotCount === 0}
          title={
            availableSlotCount === 0
              ? "Create at least one open slot before sharing a link"
              : "One link per job — first candidate to book uses it"
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Link2 className="h-4 w-4" />
          {copyJobLinkLoading ? "Creating link…" : "Copy job-wide link"}
        </button>
        <Link
          href={pipelineHref}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-white/[0.04]"
        >
          <Mail className="h-4 w-4" />
          Send link from Pipeline
        </Link>
      </div>
      <p className="mt-3 text-xs text-white/50">
        <strong className="text-white/60">WhatsApp?</strong> Use Pipeline → Request Interview
        instead — sends slot options on WhatsApp, not the web link.
      </p>
    </div>
  );
}
