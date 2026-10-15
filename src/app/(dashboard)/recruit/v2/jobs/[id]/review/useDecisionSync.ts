"use client";

import { useCallback, useState } from "react";
import { invalidateQueries } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { buildDecisionPayload, holdRestorePayload } from "@/lib/v2/decision-sync";
import type { Decision } from "@/lib/v2/review-queue";

/** Save through the existing authorized API. Callers advance only on true. */
export function useDecisionSync(jobId?: string) {
  const [failed, setFailed] = useState<string[]>([]);

  const persist = useCallback(
    async (applicationId: string, decision: Decision, reason?: string) => {
      try {
        const res = await fetch(`/api/applications/${applicationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await buildCsrfHeaders()) },
          credentials: "include",
          body: JSON.stringify(
            buildDecisionPayload({ id: applicationId, decision, reason: reason ?? null }),
          ),
        });
        if (!res.ok) throw new Error(String(res.status));
        invalidateQueries("/api/applications");
        if (jobId) invalidateQueries(`/api/jobs/${jobId}/application-summary`);
        setFailed((f) => f.filter((id) => id !== applicationId));
        return true;
      } catch {
        setFailed((f) => (f.includes(applicationId) ? f : [...f, applicationId]));
        return false;
      }
    },
    [jobId],
  );

  const restoreHold = useCallback(
    async (applicationId: string) => {
      try {
        const res = await fetch(`/api/applications/${applicationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await buildCsrfHeaders()) },
          credentials: "include",
          body: JSON.stringify(holdRestorePayload()),
        });
        if (!res.ok) throw new Error(String(res.status));
        invalidateQueries("/api/applications");
        if (jobId) invalidateQueries(`/api/jobs/${jobId}/application-summary`);
        setFailed((f) => f.filter((id) => id !== applicationId));
        return true;
      } catch {
        setFailed((f) => (f.includes(applicationId) ? f : [...f, applicationId]));
        return false;
      }
    },
    [jobId],
  );

  return { persist, restoreHold, failed };
}
