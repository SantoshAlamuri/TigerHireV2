"use client";

import { JobsListWorkspace } from "@/app/(dashboard)/recruit/jobs/JobsListWorkspace";

/** Retain company bookmarks and detail context while sharing the complete list UI. */
export default function CompanyJobsPage() {
  return <JobsListWorkspace basePath="/company/jobs" />;
}
