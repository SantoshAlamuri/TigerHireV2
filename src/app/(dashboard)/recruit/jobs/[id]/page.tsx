"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { jobPublicationState } from "@/lib/jobs/publication-state";
import { Skeleton } from "@/components/ui/Skeleton";
import { useIdealProfileGate } from "@/app/(dashboard)/recruit/jobs/[id]/hooks/useIdealProfileGate";
import { useAuth } from "@/lib/auth/AuthProvider";
import { capabilitiesFor } from "@/lib/v2/seat-capabilities";
import type { PlanHistoryRow } from "@/lib/recruitment-plan/types";
import { PlanAutomationStatus } from "@/components/recruit/plan/PlanAutomationStatus";
import { PlanReadinessStrip } from "@/components/recruit/plan/PlanReadinessStrip";
import { PlanTasksBanner } from "@/components/recruit/plan/PlanTasksBanner";
import { ActionRows } from "./ActionRows";
import { JdBaseSetupStep } from "./components/JdBaseSetupStep";

/**
 * Job Dashboard — one page per job (Phase 1 of the approved resolution).
 * Pipeline strip + "Action required" rows + Job Setup panel. All data comes
 * from existing APIs; the eight legacy tabs keep working and are linked from
 * the setup panel until their sections are absorbed in later phases.
 */
function Cell({
  label,
  value,
  tone,
  href,
}: {
  label: string;
  value: number | null;
  tone?: "warn" | "bad";
  href: string;
}) {
  const top =
    tone === "bad"
      ? "border-t-red-400/70"
      : tone === "warn"
        ? "border-t-amber-400/70"
        : "border-t-white/20";
  return (
    <Link
      href={href}
      className={`flex-1 rounded-lg border border-[var(--border)] ${top} border-t-2 bg-[var(--surface)]/40 px-3 py-2 transition hover:border-white/25 hover:bg-white/[0.04]`}
    >
      <div className="text-center text-[10px] font-medium uppercase tracking-wider text-white/40">
        {label}
      </div>
      <div
        className={`text-center font-mono text-2xl font-semibold tabular-nums ${
          value ? "text-[var(--text)]" : "text-white/25"
        }`}
      >
        {value ?? "—"}
      </div>
    </Link>
  );
}

/**
 * Absolute destinations, mirroring lib/v2/setup-sequence so the panel and the
 * guided sequence can never point at different places. Concatenating sub-paths
 * is how the earlier version shipped links that 404'd.
 */
const setupLinks = (jobId: string) => [
  { label: "Job description", href: `/recruit/jobs/${jobId}/edit` },
  { label: "Hiring requirements & evaluation", href: `/recruit/jobs/${jobId}#ideal-profile-setup` },
  { label: "Preview and publish", href: `/recruit/jobs/${jobId}/edit` },
  { label: "Screening questions", href: `/recruit/jobs/${jobId}/screening` },
  { label: "Interview plan", href: `/recruit/jobs/${jobId}/pipeline-stages` },
];

export default function RecruitV2JobDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const { data: jobData, loading: jobLoading } = useApiQuery<{
    job: {
      title?: string;
      location?: string;
      status?: string;
      is_active?: boolean;
      list_on_public_job_board?: boolean;
    };
  }>(id ? `/api/jobs/${id}` : null);
  const { data: historyData } = useApiQuery<{ history: PlanHistoryRow[] }>(
    id ? `/api/jobs/${id}/recruitment-plan/history?limit=20` : null,
  );
  const { data: counts } = useApiQuery<{
    total: number;
    applied: number;
    screened: number;
    shortlisted: number;
    hired: number;
  }>(id ? `/api/jobs/${id}/application-summary` : null);
  const gate = useIdealProfileGate(id);
  const { user } = useAuth();
  const caps = capabilitiesFor(user?.role);

  if (!id) return null;
  const publication = jobPublicationState(jobData?.job);
  const title = jobData?.job?.title ?? (jobLoading ? "" : "Job");

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          {jobLoading ? (
            <Skeleton className="h-7 w-64" />
          ) : (
            <h1 className="truncate text-xl font-bold text-[var(--text)]">{title}</h1>
          )}
          <p className="text-sm text-white/55">{jobData?.job?.location?.trim() || ""}</p>
        </div>
        {/* Upload and scoring are daily actions, not settings — they live in the header.
            Phase 1 routes to today's surfaces (bulk upload on Candidates, recompute on Matches). */}
        <Link
          href={`/recruit/v2/jobs/${id}/add`}
          className="rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          + Add candidates
        </Link>
        <Link
          href={
            gate.canScore
              ? `/recruit/jobs/${id}/matches`
              : `/recruit/jobs/${id}#ideal-profile-setup`
          }
          className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-semibold text-white/70 hover:text-[var(--text)]"
        >
          {gate.canScore ? "Score candidates" : "Set up scoring"}
        </Link>
        <Link
          href="/recruit/jobs"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Jobs
        </Link>
      </div>

      <p className="mb-4 text-sm text-[var(--text-muted)]">
        <strong>{publication.label}</strong>
        {publication.detail ? ` · ${publication.detail}` : ""}
      </p>
      {caps.editJobSetup && !publication.publicApplications && (
        <Link
          href={`/recruit/jobs/${id}/setup`}
          className="mb-4 inline-block rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black"
        >
          Continue job setup
        </Link>
      )}

      <div className="mb-5 flex gap-2 overflow-x-auto">
        <Cell
          label="Applied"
          value={counts?.total ?? null}
          href={`/recruit/v2/jobs/${id}/stage/applied`}
        />
        <Cell
          label="Screened"
          value={counts?.screened ?? null}
          href={`/recruit/v2/jobs/${id}/stage/screened`}
        />
        <Cell
          label="New — to review"
          value={counts?.applied ?? null}
          tone={counts?.applied ? "warn" : undefined}
          href={`/recruit/v2/jobs/${id}/stage/review`}
        />
        <Cell
          label="Shortlisted"
          value={counts?.shortlisted ?? null}
          href={`/recruit/v2/jobs/${id}/stage/shortlisted`}
        />
        <Cell
          label="Hired"
          value={counts?.hired ?? null}
          href={`/recruit/v2/jobs/${id}/stage/hired`}
        />
      </div>

      <nav
        aria-label="Job activities"
        className="mb-4 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]"
      >
        <Link href={`/recruit/jobs/${id}/interviews`}>Interviews</Link>
        {(caps.submitFeedback || caps.reviewApplications) && (
          <Link href={`/recruit/jobs/${id}/feedback`}>Interview feedback</Link>
        )}
        {caps.reviewApplications && <Link href={`/recruit/v2/jobs/${id}/offers`}>Offers</Link>}
      </nav>

      <div className="mb-5 space-y-3">
        <PlanReadinessStrip jobId={id} />
        <PlanAutomationStatus history={historyData?.history ?? []} />
        <PlanTasksBanner jobId={id} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div>
          <ActionRows jobId={id} caps={caps} gate={gate} newCount={counts?.applied ?? null} />
          {/* The scoring gate must live on the page every "Set up scoring" link
              anchors to — it previously rendered only on the orphaned legacy page. */}
          {caps.editJobSetup ? (
            <JdBaseSetupStep jobId={id} variant="recruit" scrollAnchorId="ideal-profile-setup" />
          ) : null}
        </div>

        {caps.editJobSetup ? (
          <aside className="h-fit rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-4">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--text)]">Job Setup</h2>
              <Link
                href={`/recruit/jobs/${id}/setup`}
                className="ml-auto text-xs font-semibold text-[var(--accent)]"
              >
                Sequence →
              </Link>
            </div>
            <p className="mb-2 text-xs text-white/50">Configured once. Out of the daily path.</p>
            <ul className="divide-y divide-white/5">
              {setupLinks(id).map(({ label, href }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="flex items-center justify-between py-2 text-sm text-white/70 hover:text-[var(--text)]"
                  >
                    <span>{label}</span>
                    <span className="text-xs text-white/35">open</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
