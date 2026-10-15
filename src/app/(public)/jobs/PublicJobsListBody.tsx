"use client";

import type { JobPosting } from "@/types";
import { PublicJobCard } from "./PublicJobCard";

type Row = { posting: JobPosting; showSalary: boolean };

export function PublicJobsListBody({
  jobs,
  total,
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  jobs: Row[];
  total: number;
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <p className="mt-8 text-sm text-white/55">
        {total} {total === 1 ? "role" : "roles"} listed
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map(({ posting, showSalary }) => (
          <PublicJobCard key={posting.id} job={posting} showSalary={showSalary} />
        ))}
      </div>

      {totalPages > 1 && (
        <div className="mt-10 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={page <= 1}
            className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Previous
          </button>
          <span className="px-4 text-sm text-white/55">
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={onNext}
            disabled={page >= totalPages}
            className="rounded-md border border-white/15 bg-white/[0.04] px-4 py-2 text-sm font-medium text-white transition hover:border-white/25 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </>
  );
}
