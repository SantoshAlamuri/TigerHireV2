"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { RecruitCandidateOfferDraft } from "@/components/dashboard/RecruitCandidateOfferDraft";

type ApplicationRow = {
  id: string;
  status: string | null;
  jobs?: { title: string | null } | { title: string | null }[] | null;
  candidates?: { id: string; name: string | null } | null;
};

function jobTitle(app: ApplicationRow): string {
  const j = app.jobs;
  if (!j) return "Role";
  const row = Array.isArray(j) ? j[0] : j;
  return row?.title?.trim() || "Role";
}

export type RecruitOfferDraftWorkspaceProps = {
  /** Where the “Back to offers” link goes. */
  offersListHref: string;
};

export function RecruitOfferDraftWorkspace({ offersListHref }: RecruitOfferDraftWorkspaceProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const appIdFromUrl = searchParams.get("applicationId");
  const dashboardPrefix = offersListHref.startsWith("/company") ? "/company" : "/recruit";
  const jobsHref = `${dashboardPrefix}/jobs`;
  const pipelineHref =
    dashboardPrefix === "/company" && user?.role !== "leadership"
      ? "/company/my-pipeline"
      : "/recruit/pipeline";
  /** Candidate directory is recruit-scoped in the product; shared for org-wide hiring work. */
  const candidatesHref = "/recruit/candidates";

  const canListApplications =
    user?.role === "recruiter" || user?.role === "leadership" || user?.role === "super_admin";
  const { data: enterpriseCap, loading: capabilitiesLoading } = useApiQuery<{
    canCreateOffers?: boolean;
  }>(
    user && (user.role === "recruiter" || user.role === "hiring_manager")
      ? "/api/me/enterprise-capabilities"
      : null,
  );
  const canCreateOffers =
    user?.role === "leadership" ||
    user?.role === "super_admin" ||
    enterpriseCap?.canCreateOffers === true;
  const canUseDirectApplicationDraft = user?.role === "hiring_manager" && canCreateOffers;

  const { data, loading, error } = useApiQuery<{ applications: ApplicationRow[] }>(
    canListApplications ? "/api/applications" : null,
    canListApplications ? { limit: 100 } : undefined,
  );

  const apps = data?.applications ?? [];
  const selectedId = useMemo(() => {
    if (canUseDirectApplicationDraft) return appIdFromUrl?.trim() || "";
    if (apps.length === 0) return "";
    if (appIdFromUrl && apps.some((a) => a.id === appIdFromUrl)) return appIdFromUrl;
    return "";
  }, [apps, appIdFromUrl, canUseDirectApplicationDraft]);

  const selected = useMemo(() => apps.find((a) => a.id === selectedId) ?? null, [apps, selectedId]);
  const { data: selectedApplicationData } = useApiQuery<{
    application?: { jobs?: { title?: string | null } | { title?: string | null }[] | null };
  }>(canUseDirectApplicationDraft && selectedId ? `/api/applications/${selectedId}` : null);
  const selectedRoleTitle = useMemo(() => {
    if (selected) return jobTitle(selected);
    const jobs = selectedApplicationData?.application?.jobs;
    const row = Array.isArray(jobs) ? jobs[0] : jobs;
    return row?.title?.trim() || "Role";
  }, [selected, selectedApplicationData?.application?.jobs]);
  const appIdProvided = typeof appIdFromUrl === "string" && appIdFromUrl.trim().length > 0;

  if (!user) {
    return <p className="text-sm text-[var(--text-muted)]">Sign in to draft offers.</p>;
  }

  if (capabilitiesLoading && user.role === "hiring_manager") {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 size={14} className="animate-spin" /> Loading offer permissions...
      </p>
    );
  }

  if (!canListApplications && !canUseDirectApplicationDraft) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
        <p>
          You can view offer progress, but draft creation is blocked for your role. Use{" "}
          <Link
            href="/recruit/candidates"
            className="font-medium text-[var(--accent)] hover:underline"
          >
            Candidates
          </Link>{" "}
          and open a profile, or ask a recruiter / company admin to draft here.
        </p>
      </div>
    );
  }

  if (!appIdProvided) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
        <p className="text-[var(--text)]">Start draft creation from Pipeline stage only.</p>
        <p className="mt-1">
          Move the candidate to the Offer stage in pipeline, then open the candidate profile and
          start offer drafting from there.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href={pipelineHref}
            className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Open pipeline
          </Link>
          <Link
            href={offersListHref}
            className="inline-flex items-center rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
          >
            Back to offers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={offersListHref}
          className="text-xs font-medium text-[var(--accent)] hover:underline"
        >
          ← Back to offers
        </Link>
        {loading ? (
          <span className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <Loader2 size={14} className="animate-spin" /> Loading applications…
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-300">
          Could not load applications. Try refreshing the page.
        </p>
      ) : null}

      {!loading && apps.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-muted)]">
          <p className="mb-2">No applications in your organisation yet.</p>
          <Link href={jobsHref} className="font-medium text-[var(--accent)] hover:underline">
            Open jobs
          </Link>{" "}
          or{" "}
          <Link href={candidatesHref} className="font-medium text-[var(--accent)] hover:underline">
            candidates
          </Link>{" "}
          to get applications flowing.
          {dashboardPrefix === "/company" ? (
            <span className="mt-2 block text-[11px] text-[var(--text-subtle)]">
              Requisitions:{" "}
              <Link
                href="/company/hiring-requests"
                className="font-medium text-[var(--accent)] hover:underline"
              >
                Hiring requests
              </Link>
              .
            </span>
          ) : null}
        </div>
      ) : null}

      {!loading && appIdProvided && apps.length > 0 && !selectedId ? (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
          The requested application is not available for your access scope. Open draft flow again
          from the pipeline stage for this candidate.
        </div>
      ) : null}

      {selectedId ? (
        <RecruitCandidateOfferDraft
          applicationId={selectedId}
          defaultRoleTitle={selectedRoleTitle}
          collapsible={false}
          dashboardPrefix={dashboardPrefix}
        />
      ) : null}
    </div>
  );
}
