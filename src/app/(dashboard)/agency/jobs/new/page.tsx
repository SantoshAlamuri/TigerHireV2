"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects /agency/jobs/new to the merged Jobs page with create view.
 * Preserves clientId query for "Post JD" from client detail.
 */
export default function AgencyJobsNewRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams({ view: "create" });
    const clientId = searchParams.get("clientId");
    if (clientId) params.set("clientId", clientId);
    router.replace(`/agency/jobs?${params.toString()}`);
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--accent)]" />
    </div>
  );
}
