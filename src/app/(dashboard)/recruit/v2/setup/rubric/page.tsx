"use client";

import Link from "next/link";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { approvalLine } from "@/lib/v2/rubric-detail";
import { SeatGate } from "../../SeatGate";

/**
 * Rubric library — every scoring bar in the org, and who signed it.
 *
 * Hiring Setup listed "Scoring rubrics" and pointed at a route that was never
 * built, so the entry read as a feature and behaved as a 404. This is that
 * page: one rubric per role, with its version and its named approver, because
 * an unapproved rubric silently drops a job onto the generic scoring path and
 * nothing else in the product says so out loud.
 */
interface RubricRow {
  id: string;
  jobId: string;
  jobTitle: string;
  jobStatus: string | null;
  version: number;
  approverName: string | null;
  approvedAt: string | null;
}

function RubricLibraryPageBody() {
  const { data, loading } = useApiQuery<{ rubrics: RubricRow[] }>("/api/fitscore/rubrics");
  const rubrics = data?.rubrics ?? [];
  const unapproved = rubrics.filter((r) => !r.approvedAt).length;

  return (
    <section className="max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-[var(--text)]">Rubric library</h1>
          <p className="text-sm text-white/55">
            One rubric per role — versioned, with a named approver.
          </p>
        </div>
        <Link
          href="/recruit/v2/setup"
          className="text-sm font-semibold text-white/60 hover:text-[var(--text)]"
        >
          ← Hiring Setup
        </Link>
      </div>

      {unapproved > 0 ? (
        <p className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/5 px-4 py-3 text-sm text-amber-200/90">
          {unapproved} {unapproved === 1 ? "rubric is" : "rubrics are"} unapproved. Until a rubric
          is signed, that job scores on the generic bar.
        </p>
      ) : null}

      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : rubrics.length === 0 ? (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 text-sm text-white/60">
          No rubrics yet. A rubric is built on the job it scores — open a job and run its setup
          sequence.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
          {rubrics.map((r) => {
            const approval = approvalLine(r.approverName, r.approvedAt);
            return (
              <li key={r.id} className="border-b border-white/5 last:border-b-0">
                <Link
                  href={`/recruit/v2/setup/rubric/${r.jobId}`}
                  className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-[var(--text)]">
                      {r.jobTitle} rubric v{r.version}
                    </span>
                    <span
                      className={`block truncate text-xs ${
                        approval.approved ? "text-white/45" : "text-amber-300/80"
                      }`}
                    >
                      {approval.text}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-white/30">→</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function RubricLibraryPage() {
  return (
    <SeatGate need="editJobSetup" what="The rubric library">
      <RubricLibraryPageBody />
    </SeatGate>
  );
}
