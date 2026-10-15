"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { approvalLine } from "@/lib/v2/rubric-detail";
import { SeatGate } from "../SeatGate";

/**
 * Governance — the sign-off queue, with the cost of not signing made visible.
 *
 * Approval is already real in the product (`approved_by`, `approved_at`). What
 * was missing is anywhere it reads as a queue with consequences: an unapproved
 * rubric silently drops its job onto the generic scoring path, and the only way
 * to discover that was to open the job.
 *
 * So the waiting-on-you list leads with what is blocked and for how long,
 * rather than listing rubrics and leaving the reader to work out why it matters.
 */
interface RubricRow {
  id: string;
  jobId: string;
  jobTitle: string;
  jobStatus: string | null;
  version: number;
  approverName: string | null;
  approvedAt: string | null;
  updatedAt: string | null;
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 86_400_000));
}

function GovernancePageBody() {
  const { data, loading } = useApiQuery<{ rubrics: RubricRow[] }>("/api/fitscore/rubrics");
  const rubrics = data?.rubrics ?? [];
  const waiting = rubrics.filter((r) => !r.approvedAt);
  const approved = rubrics.filter((r) => r.approvedAt);

  return (
    <section>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-[var(--text)]">Governance</h1>
        <p className="text-sm text-white/55">
          {loading
            ? "Loading…"
            : waiting.length === 0
              ? "Nothing waiting on a signature."
              : `${waiting.length} ${waiting.length === 1 ? "rubric" : "rubrics"} waiting on you`}
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          {waiting.length > 0 ? (
            <>
              <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
                Waiting on you
              </h2>
              <ul className="mb-5 space-y-2">
                {waiting.map((r) => {
                  const age = daysSince(r.updatedAt);
                  return (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-3 rounded-xl border border-l-[3px] border-[var(--border)] border-l-amber-400 bg-[var(--surface)]/40 px-4 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-[var(--text)]">
                          {r.jobTitle} rubric v{r.version}
                        </span>
                        <span className="block text-xs text-white/50">
                          Nothing scores properly until you sign — this job is on the generic bar
                          {age === null ? "" : `, ${age} ${age === 1 ? "day" : "days"} so far`}.
                        </span>
                      </span>
                      <Link
                        href={`/recruit/v2/setup/rubric/${r.jobId}`}
                        className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black"
                      >
                        Review &amp; approve
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}

          <h2 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-white/35">
            Rubric library — click to open
          </h2>
          {approved.length === 0 ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
              No approved rubrics yet. Until one is signed, every job scores on the generic bar.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
              {approved.map((r) => (
                <li key={r.id} className="border-b border-white/5 last:border-b-0">
                  <Link
                    href={`/recruit/v2/setup/rubric/${r.jobId}`}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--text)]">
                        {r.jobTitle} rubric v{r.version}
                      </span>
                      <span className="block truncate text-xs text-white/45">
                        {approvalLine(r.approverName, r.approvedAt).text}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-white/30">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <p className="mt-3 text-xs text-white/40">
            Changing weights or thresholds resets approval. Scores already stamped keep the version
            that produced them, so an old decision stays explainable.
          </p>
        </>
      )}
    </section>
  );
}

export default function GovernancePage() {
  return (
    <SeatGate need="approveRubrics" what="The sign-off queue">
      <GovernancePageBody />
    </SeatGate>
  );
}
