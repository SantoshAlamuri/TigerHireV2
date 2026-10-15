"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

/** When plan document is on, HM/leadership job cards land on the recruit plan workspace. */
export function CompanyJobPlanRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const enabled = isPlanDocumentUiEnabled();

  useEffect(() => {
    if (!enabled || !id) return;
    const raw = typeof window !== "undefined" ? window.location.hash : "";
    const hash =
      raw === "#scoring-setup" || raw === "#ideal-profile-setup" ? "#ideal-profile-setup" : raw;
    router.replace(`/recruit/jobs/${id}${hash}`);
  }, [enabled, id, router]);

  if (!enabled) return null;

  return (
    <div
      className="flex min-h-[40vh] items-center justify-center"
      role="status"
      aria-label="Opening recruitment plan"
    >
      <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" aria-hidden />
    </div>
  );
}
