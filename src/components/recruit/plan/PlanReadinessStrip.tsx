"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Loader2,
  MinusCircle,
} from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { isFullyReady, type JobReadinessResponse } from "@/lib/jobs/job-readiness";
import { Skeleton } from "@/components/ui/Skeleton";

type Tone = "success" | "warning" | "danger" | "muted";

// Use the shared --status-* token vocabulary (not raw emerald/amber/red) so the
// readiness cards read in the same colour language as StatusBadge and the rest
// of the app (audit F-01); muted floored at --text-subtle for contrast (F-05).
const TONE_CLASS: Record<Tone, { text: string; icon: string }> = {
  success: {
    text: "text-[color:var(--status-success-fg)]",
    icon: "text-[color:var(--status-success-fg)]",
  },
  warning: {
    text: "text-[color:var(--status-warning-fg)]",
    icon: "text-[color:var(--status-warning-fg)]",
  },
  danger: {
    text: "text-[color:var(--status-danger-fg)]",
    icon: "text-[color:var(--status-danger-fg)]",
  },
  muted: { text: "text-[var(--text-subtle)]", icon: "text-[var(--text-subtle)]" },
};

// Tint the card border/background by state so the funnel is scannable at a glance and the
// step that needs action (warning/danger) reads as the hero — not just via the small icon.
// Completed (success) and not-applicable (muted) steps stay quiet; the actionable step pops.
const TONE_CARD: Record<Tone, string> = {
  success: "border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)]/30",
  warning:
    "border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)]/50 ring-1 ring-[color:var(--status-warning-border)]",
  danger:
    "border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)]/50 ring-1 ring-[color:var(--status-danger-border)]",
  muted: "border-[var(--border)] bg-[var(--surface)]/40",
};

function ToneIcon({ tone }: { tone: Tone }) {
  const cls = TONE_CLASS[tone].icon;
  if (tone === "success") return <CheckCircle2 className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
  if (tone === "muted") return <MinusCircle className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
  if (tone === "danger") return <AlertCircle className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
  return <AlertCircle className={`h-5 w-5 shrink-0 ${cls}`} aria-hidden />;
}

function hiringRequestHref(hiringRequestId: string, role: string | undefined): string {
  if (role === "recruiter" || role === "super_admin") {
    return `/recruit/hiring-requests/${hiringRequestId}`;
  }
  return `/company/hiring-requests/${hiringRequestId}`;
}

function jobEditHref(jobId: string, role: string | undefined): string {
  if (role === "hiring_manager") return `/company/jobs/${jobId}/edit`;
  return `/recruit/jobs/${jobId}/edit`;
}

function requisitionStep(readiness: JobReadinessResponse, role: string | undefined) {
  const { requisition: r } = readiness;
  switch (r.status) {
    case "approved":
      return {
        tone: "success" as Tone,
        title: "Requisition approved",
        detail: r.req_code ? `REQ ${r.req_code}` : "Linked requisition is converted",
        cta: null,
      };
    case "not_linked":
      return {
        tone: "muted" as Tone,
        title: "No requisition linked",
        detail: "Optional — jobs can run without a formal requisition",
        cta: { href: "/company/hiring-requests/new", label: "Create requisition" },
      };
    case "draft":
      return {
        tone: "warning" as Tone,
        title: "Requisition in draft",
        detail: "Submit when ready for approval",
        cta: r.hiring_request_id
          ? { href: hiringRequestHref(r.hiring_request_id, role), label: "Open requisition" }
          : null,
      };
    case "on_hold":
      return {
        tone: "danger" as Tone,
        title: "Requisition on hold",
        detail: r.on_hold_reason?.trim() || "Review before continuing hiring",
        cta: r.hiring_request_id
          ? { href: hiringRequestHref(r.hiring_request_id, role), label: "View requisition" }
          : null,
      };
    case "rejected":
      return {
        tone: "danger" as Tone,
        title: r.raw_status === "cancelled" ? "Requisition cancelled" : "Requisition rejected",
        detail: "Clone or open a new requisition if the role is still needed",
        cta: r.hiring_request_id
          ? { href: hiringRequestHref(r.hiring_request_id, role), label: "View requisition" }
          : null,
      };
    default:
      return {
        tone: "warning" as Tone,
        title: "Awaiting requisition approval",
        detail: r.reviewer_name
          ? `Last action by ${r.reviewer_name}`
          : "Recruiter or approver decisions pending",
        cta: r.hiring_request_id
          ? { href: hiringRequestHref(r.hiring_request_id, role), label: "Open requisition" }
          : null,
      };
  }
}

function jdStep(jobId: string, readiness: JobReadinessResponse, role: string | undefined) {
  const editHref = jobEditHref(jobId, role);
  if (readiness.jd.status === "published") {
    return {
      tone: "success" as Tone,
      title: "Job description added",
      detail: `${readiness.jd.char_count.toLocaleString()} characters of role content`,
      cta: { href: editHref, label: "Edit JD" },
    };
  }
  return {
    tone: "danger" as Tone,
    title: "JD missing or incomplete",
    detail: `Add at least 100 characters in the job description or structured JD sections (currently ${readiness.jd.char_count})`,
    cta: { href: editHref, label: "Create JD" },
  };
}

const ICP_SETUP_HASH = "#ideal-profile-setup";

function idealProfileStep(readiness: JobReadinessResponse) {
  const { jd_base: b } = readiness;
  if (b.status === "not_applicable") {
    return {
      tone: "muted" as Tone,
      title: "Ideal Profile (org legacy scoring)",
      detail: "Role-specific hybrid scoring is not enabled for this organisation",
      footnote: null,
      action: null as "generate" | "approve" | null,
      reviewHref: null as string | null,
    };
  }
  if (b.status === "approved") {
    const when = b.approved_at
      ? new Date(b.approved_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null;
    return {
      tone: "success" as Tone,
      title: "Ideal Profile approved",
      detail: b.approved_by_name
        ? `Approved by ${b.approved_by_name}${when ? ` on ${when}` : ""}`
        : when
          ? `Approved on ${when}`
          : "Scoring foundation is active",
      footnote: null,
      action: null as "generate" | "approve" | null,
      reviewHref: ICP_SETUP_HASH,
    };
  }
  if (b.status === "pending_approval") {
    return {
      tone: "warning" as Tone,
      title: "Ideal Profile pending approval",
      detail:
        "Open scoring setup below — review the ICP, rubric weights, then approve in the wizard",
      footnote:
        "Without an approved Ideal Profile, candidates are scored on the generic path instead of role-specific scoring. This reduces FitScore accuracy.",
      action: null as "generate" | "approve" | null,
      reviewHref: ICP_SETUP_HASH,
    };
  }
  return {
    tone: "danger" as Tone,
    title: "Ideal Profile not generated",
    detail: "Open scoring setup to generate the ICP and rubric for this role",
    footnote:
      "Without an approved Ideal Profile, candidates are scored on the generic path instead of role-specific scoring. This reduces FitScore accuracy.",
    action: "generate" as const,
    reviewHref: ICP_SETUP_HASH,
  };
}

function scoringStep(readiness: JobReadinessResponse) {
  const { scoring: s } = readiness;
  switch (s.status) {
    case "legacy_path":
      return {
        tone: "muted" as Tone,
        title: "Legacy FitScore path",
        detail:
          s.total > 0
            ? `${s.total} candidate${s.total === 1 ? "" : "s"} on the standard scoring path`
            : "Hybrid role-specific scoring is not enabled",
        cta: null as "rescore" | null,
      };
    case "inactive":
      return {
        tone: "muted" as Tone,
        title: "Scoring inactive",
        detail: "Approve the Ideal Profile first to enable role-specific scoring",
        cta: null as "rescore" | null,
      };
    case "no_candidates":
      return {
        tone: "success" as Tone,
        title: "Ready — no candidates scored yet",
        detail:
          s.pending_scoring_count > 0
            ? `${s.pending_scoring_count} queued after approval`
            : "New applicants will use the role-specific path",
        cta: null as "rescore" | null,
      };
    case "needs_rescore":
      return {
        tone: "warning" as Tone,
        title: `${s.legacy_count} of ${s.total} need re-scoring`,
        detail: `${s.hybrid_v2_count} already on role-specific scoring`,
        cta: "rescore" as const,
      };
    default:
      return {
        tone: "success" as Tone,
        title: `All ${s.total} candidate${s.total === 1 ? "" : "s"} on role-specific scoring`,
        detail:
          s.pending_scoring_count > 0
            ? `${s.pending_scoring_count} still queued from before approval`
            : "FitScores use the approved Ideal Profile",
        cta: null as "rescore" | null,
      };
  }
}

function StepCell({
  label,
  tone,
  title,
  detail,
  linkCta,
  buttonCta,
  footnote,
}: {
  label: string;
  tone: Tone;
  title: string;
  detail: string;
  linkCta?: { href: string; label: string } | null;
  buttonCta?: { label: string; onClick: () => void; loading?: boolean } | null;
  footnote?: string | null;
}) {
  return (
    <div
      className={`relative flex min-w-0 flex-1 flex-col gap-2 rounded-lg border p-3 sm:p-4 ${TONE_CARD[tone]}`}
    >
      <p className="text-caption font-semibold uppercase tracking-wider text-[var(--text-subtle)]">
        {label}
      </p>
      <div className="flex gap-2">
        <ToneIcon tone={tone} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${TONE_CLASS[tone].text}`}>{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{detail}</p>
          {footnote ? (
            <p className="mt-2 rounded-md border-l-2 border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] px-2.5 py-1.5 text-xs leading-relaxed text-[var(--text)]">
              {footnote}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            {linkCta ? (
              <Link
                href={linkCta.href}
                className="inline-flex rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-semibold text-[var(--text)] hover:bg-white/[0.04]"
              >
                {linkCta.label}
              </Link>
            ) : null}
            {buttonCta ? (
              <button
                type="button"
                onClick={buttonCta.onClick}
                disabled={buttonCta.loading}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-black disabled:opacity-50"
              >
                {buttonCta.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {buttonCta.label}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlanReadinessStrip({ jobId }: { jobId: string }) {
  const { user } = useAuth();
  const enabled = isPlanDocumentUiEnabled();
  const [expanded, setExpanded] = useState(false);
  const [action, setAction] = useState<"generate" | "approve" | "rescore" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, refetch } = useApiQuery<JobReadinessResponse>(
    enabled ? `/api/jobs/${jobId}/readiness` : null,
  );

  const readiness = data ?? null;
  const fullyReady = readiness ? isFullyReady(readiness) : false;
  const showExpanded = expanded || !fullyReady;

  const runJdBaseAction = useCallback(
    async (kind: "generate" | "approve" | "rescore") => {
      setAction(kind);
      setActionError(null);
      try {
        const csrf = await buildCsrfHeaders();
        if (kind === "generate") {
          const res = await fetch("/api/fitscore/jd-base", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...csrf },
            credentials: "include",
            body: JSON.stringify({ jobId }),
          });
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) throw new Error(body.error ?? "Failed to generate Ideal Profile");
        } else {
          const res = await fetch("/api/fitscore/jd-base/approve", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...csrf },
            credentials: "include",
            body: JSON.stringify({ jobId }),
          });
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) throw new Error(body.error ?? "Failed to approve or re-score");
        }
        await refetch();
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setAction(null);
      }
    },
    [jobId, refetch],
  );

  const steps = useMemo(() => {
    if (!readiness) return null;
    const role = user?.role;
    const req = requisitionStep(readiness, role);
    const jd = jdStep(jobId, readiness, role);
    const ideal = idealProfileStep(readiness);
    const score = scoringStep(readiness);

    let idealButton: { label: string; onClick: () => void; loading?: boolean } | null = null;
    let idealLink: { href: string; label: string } | null = null;
    if (ideal.reviewHref) {
      idealLink = { href: ideal.reviewHref, label: "Open ICP setup" };
    }
    if (ideal.action === "generate") {
      idealButton = {
        label: "Generate Ideal Profile",
        onClick: () => void runJdBaseAction("generate"),
        loading: action === "generate",
      };
    }

    let scoreButton: { label: string; onClick: () => void; loading?: boolean } | null = null;
    if (score.cta === "rescore") {
      scoreButton = {
        label: "Re-score candidates",
        onClick: () => void runJdBaseAction("rescore"),
        loading: action === "rescore",
      };
    }

    return [
      {
        key: "req",
        label: "1 · Requisition",
        tone: req.tone,
        title: req.title,
        detail: req.detail,
        linkCta: req.cta,
        buttonCta: null,
        footnote: null,
      },
      {
        // ICP (scoring rubric) is seeded from the role, not the JD, so it can be defined first.
        // The JD is a parallel artifact (the advertisement) that only optionally tailors the ICP.
        key: "ideal",
        label: "2 · Ideal Profile",
        tone: ideal.tone,
        title: ideal.title,
        detail: ideal.detail,
        footnote: ideal.footnote,
        linkCta: idealLink,
        buttonCta: idealButton,
      },
      {
        key: "jd",
        label: "3 · Job description",
        tone: jd.tone,
        title: jd.title,
        detail: jd.detail,
        linkCta: jd.cta,
        buttonCta: null,
        footnote: null,
      },
      {
        key: "score",
        label: "4 · Scoring",
        tone: score.tone,
        title: score.title,
        detail: score.detail,
        footnote: null,
        linkCta: null,
        buttonCta: scoreButton,
      },
    ];
  }, [readiness, user?.role, jobId, runJdBaseAction, action]);

  if (!enabled) return null;

  if (loading) {
    return (
      <section aria-label="Scoring readiness">
        <Skeleton className="h-28 w-full" />
      </section>
    );
  }

  if (error || !readiness) {
    return (
      <section
        aria-label="Scoring readiness"
        className="rounded-lg border border-[color:var(--status-danger-border)] bg-[color:var(--status-danger-bg)] px-4 py-3 text-sm text-[color:var(--status-danger-fg)]"
      >
        {error ?? "Could not load hiring readiness"}
      </section>
    );
  }

  return (
    <section aria-label="Scoring readiness" className="space-y-3">
      {fullyReady ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] px-4 py-3 text-left text-sm text-[color:var(--status-success-fg)]"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
            Scoring setup is ready
          </span>
          {showExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          )}
        </button>
      ) : (
        <div className="flex items-center gap-2">
          <Circle
            className="h-2 w-2 shrink-0 fill-[var(--accent)] text-[var(--accent)]"
            aria-hidden
          />
          <h2 className="text-sm font-semibold text-[var(--text)]">Hiring readiness</h2>
        </div>
      )}

      {showExpanded ? (
        <>
          <div className="hidden items-stretch gap-2 lg:flex">
            {steps?.map((step, index) => (
              <div
                key={step.key}
                className={`flex min-w-0 items-stretch gap-2 ${
                  step.tone === "warning" || step.tone === "danger" ? "flex-[1.6]" : "flex-1"
                }`}
              >
                <StepCell
                  label={step.label}
                  tone={step.tone}
                  title={step.title}
                  detail={step.detail}
                  linkCta={step.linkCta}
                  buttonCta={step.buttonCta}
                  footnote={step.footnote}
                />
                {index < 3 ? (
                  <ChevronRight
                    className="hidden h-5 w-5 shrink-0 self-center text-white/25 xl:block"
                    aria-hidden
                  />
                ) : null}
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 lg:hidden">
            {steps?.map((step) => (
              <StepCell
                key={step.key}
                label={step.label}
                tone={step.tone}
                title={step.title}
                detail={step.detail}
                linkCta={step.linkCta}
                buttonCta={step.buttonCta}
                footnote={step.footnote}
              />
            ))}
          </div>
          {actionError ? (
            <p className="text-sm text-[color:var(--status-danger-fg)]">{actionError}</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
