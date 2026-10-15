"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { HiringManagerHome, AgencyHome } from "./SeatHome";
import { JobsListWorkspace } from "./JobsListWorkspace";

/** Separate seats do not start recruiter-only list requests. */
export default function RecruitJobsPage() {
  const { user } = useAuth();
  if (user?.role === "hiring_manager") return <HiringManagerHome />;
  if (user?.role === "agency") return <AgencyHome />;
  return <JobsListWorkspace />;
}
