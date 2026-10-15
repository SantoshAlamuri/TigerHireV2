"use client";

import { useParams } from "next/navigation";
import { RecruiterApplicationsList } from "@/app/(dashboard)/recruit/applications/page";

/**
 * Per-job applications tab. Reuses the applications list scoped to this job via the API's jobId
 * filter, so applications live under the job rather than as a global nav sub-tab.
 */
export default function JobApplicationsPage() {
  const params = useParams<{ id: string }>();
  const jobId = params?.id;
  if (!jobId) return null;
  return <RecruiterApplicationsList jobId={jobId} />;
}
