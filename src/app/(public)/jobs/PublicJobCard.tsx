"use client";

import Link from "next/link";
import type { JobPosting } from "@/types";
import { PublicJobCardBody } from "./PublicJobCardBody";

export function PublicJobCard({ job, showSalary }: { job: JobPosting; showSalary: boolean }) {
  return (
    <div className="card-lifted-marketing card-lifted-marketing-hover relative flex min-h-[200px] flex-col overflow-hidden p-5">
      <Link
        href={`/jobs/${job.id}`}
        className="group block cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45"
      >
        <PublicJobCardBody job={job} showSalary={showSalary} />
      </Link>
    </div>
  );
}
