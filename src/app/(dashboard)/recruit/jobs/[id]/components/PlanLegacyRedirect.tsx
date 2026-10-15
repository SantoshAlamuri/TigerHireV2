"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

/** When plan document flag is on, legacy tab routes redirect to the plan view. */
export function PlanLegacyRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!isPlanDocumentUiEnabled() || !id) return;
    router.replace(`/recruit/jobs/${id}`);
  }, [id, router]);

  return null;
}
