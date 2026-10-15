"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";
import { Loader2, CheckCircle2, XCircle, Clock, Shield } from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { Skeleton } from "@/components/ui/Skeleton";

type ApproverRole = "recruiter" | "hiring_manager";
type Decision = "approved" | "rejected" | "pending";

interface ApprovalEntry {
  approver_role: ApproverRole;
  decision: string;
  decided_at: string | null;
  notes: string | null;
}

interface CandidateRow {
  id: string;
  candidate_id: string;
  status: string;
  candidates?: {
    id: string;
    name: string | null;
    email?: string;
    skills?: unknown;
    location?: string | null;
  } | null;
  approvals: ApprovalEntry[];
}

function getApprovalByRole(approvals: ApprovalEntry[], role: ApproverRole): Decision {
  const a = approvals.find((x) => x.approver_role === role);
  if (!a) return "pending";
  return a.decision === "approved"
    ? "approved"
    : a.decision === "rejected"
      ? "rejected"
      : "pending";
}

function ApprovalBadge({ decision }: { decision: Decision }) {
  if (decision === "approved") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 size={12} />
        Approved
      </span>
    );
  }
  if (decision === "rejected") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
        <XCircle size={12} />
        Rejected
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-zinc-400">
      <Clock size={12} />
      Pending
    </span>
  );
}

function CandidateActions({
  candidateId,
  candidateName,
  recruiterStatus,
  hmStatus,
  myRole,
  jobId,
  onSuccess,
}: {
  candidateId: string;
  candidateName: string;
  recruiterStatus: Decision;
  hmStatus: Decision;
  myRole: ApproverRole | null;
  jobId: string;
  onSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  const myStatus =
    myRole === "recruiter" ? recruiterStatus : myRole === "hiring_manager" ? hmStatus : null;
  const canAct = myRole !== null && myStatus === "pending";

  const handleAction = async (decision: "approved" | "rejected") => {
    setLoading(true);
    try {
      const taskId = `shortlist:${candidateId}`;
      const response = await fetch(`/api/approvals/tasks/${taskId}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          candidateId,
          jobId,
          comment: notes.trim() || null,
        }),
      });
      if (!response.ok) return;
      setExpanded(null);
      setNotes("");
      onSuccess();
    } finally {
      setLoading(false);
    }
  };

  if (!myRole || !canAct) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {expanded === "approve" ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
            className="w-full min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/60 focus:border-white/20 focus:outline-none"
            aria-label={`Notes for approving ${candidateName}`}
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction("approved")}
              className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : "Confirm Approve"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(null);
                setNotes("");
              }}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-white/60 transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        </>
      ) : expanded === "reject" ? (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes..."
            rows={2}
            className="w-full min-w-[180px] rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/60 focus:border-white/20 focus:outline-none"
            aria-label={`Notes for rejecting ${candidateName}`}
          />
          <div className="flex gap-1">
            <button
              type="button"
              disabled={loading}
              onClick={() => handleAction("rejected")}
              className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : "Confirm Reject"}
            </button>
            <button
              type="button"
              onClick={() => {
                setExpanded(null);
                setNotes("");
              }}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs font-medium text-white/60 transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setExpanded("approve")}
            className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setExpanded("reject")}
            className="rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-400 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject
          </button>
        </>
      )}
    </div>
  );
}

export default function JobApprovalsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const planMode = isPlanDocumentUiEnabled();
  const { user } = useAuth();
  const apiEnabled = !planMode && Boolean(id);

  const { data: jobData } = useApiQuery<{ job: { title?: string } }>(
    apiEnabled ? `/api/jobs/${id}` : null,
  );
  const {
    data: approvalsData,
    loading,
    error,
    refetch,
  } = useApiQuery<{ candidates: CandidateRow[] }>(
    apiEnabled ? `/api/jobs/${id}/pipeline/approve` : null,
  );

  useEffect(() => {
    if (planMode && id) {
      router.replace(`/tasks?jobId=${encodeURIComponent(id)}`);
    }
  }, [planMode, id, router]);

  if (planMode) {
    return <Skeleton className="mx-auto mt-8 h-48 max-w-4xl w-full" />;
  }

  const myRole: ApproverRole | null =
    user?.role === "hiring_manager"
      ? "hiring_manager"
      : user?.role === "recruiter" || user?.role === "leadership" || user?.role === "super_admin"
        ? "recruiter"
        : null;

  const jobTitle = jobData?.job?.title ?? "Job";
  const candidates = approvalsData?.candidates ?? [];

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center gap-3">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-5 w-24" />
        </div>
        <div className="card-lifted overflow-hidden p-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={index}
              className="grid grid-cols-5 gap-4 border-b border-white/10 p-4 last:border-b-0"
            >
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-9 w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="heading-section text-lg text-[var(--text)]">Approvals</h2>
        <span className="text-sm text-white/60">· {jobTitle}</span>
        <span className="flex items-center gap-1.5 text-xs text-white/60">
          <Shield size={14} />
          Approval matrix
        </span>
      </div>

      <div className="overflow-x-auto card-lifted backdrop-blur-md">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr>
              <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                Candidate
              </th>
              <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                Pipeline status
              </th>
              <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                Recruiter
              </th>
              <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                HM
              </th>
              <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                Fully approved
              </th>
              {myRole && (
                <th className="heading-card px-5 py-3 text-left text-xs font-medium tracking-wide text-white/60">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {candidates.length === 0 ? (
              <tr>
                <td
                  colSpan={myRole ? 6 : 5}
                  className="px-5 py-8 text-center text-sm text-white/60"
                >
                  No pipeline candidates yet for this job.
                </td>
              </tr>
            ) : (
              candidates.map((c) => {
                const recruiterStatus = getApprovalByRole(c.approvals, "recruiter");
                const hmStatus = getApprovalByRole(c.approvals, "hiring_manager");
                const fullyApproved = recruiterStatus === "approved" && hmStatus === "approved";
                const candidateName = c.candidates?.name ?? "Unknown";

                return (
                  <tr
                    key={c.id}
                    className="border-t border-[var(--border)] transition hover:bg-white/[0.04]"
                  >
                    <td className="px-5 py-3 text-sm font-medium text-[var(--text)]">
                      {candidateName}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-zinc-400">
                        {c.status ?? "—"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <ApprovalBadge decision={recruiterStatus} />
                    </td>
                    <td className="px-5 py-3">
                      <ApprovalBadge decision={hmStatus} />
                    </td>
                    <td className="px-5 py-3">
                      {fullyApproved ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                          <CheckCircle2 size={12} />
                          Yes
                        </span>
                      ) : (
                        <span className="text-xs text-white/60">—</span>
                      )}
                    </td>
                    {myRole && (
                      <td className="px-5 py-3">
                        <CandidateActions
                          candidateId={c.candidate_id}
                          candidateName={candidateName}
                          recruiterStatus={recruiterStatus}
                          hmStatus={hmStatus}
                          myRole={myRole}
                          jobId={id}
                          onSuccess={refetch}
                        />
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
