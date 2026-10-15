"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Send,
  Eye,
  Star,
  XCircle,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Loader2,
  MessageSquare,
  Undo2,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  UserPlus,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import StatCard from "@/components/dashboard/StatCard";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";
import { useToast } from "@/components/ui/Toast";
import { useApiQuery } from "@/lib/hooks/use-api";
import { mapDbApplicationToView, mapDbFitScoreToView } from "@/lib/mappers";
import { getApplicationStatusTone } from "@/lib/status-tones";
import type { Application, ApplicationStatus, FitScore } from "@/types";

interface OfferRow {
  id: string;
  role_title: string;
  status: string;
  start_date: string;
  expires_at: string | null;
}

const STATUS_META: Record<ApplicationStatus, { label: string; icon: React.ReactNode }> = {
  applied: {
    label: "Applied",
    icon: <Send size={14} />,
  },
  viewed: {
    label: "Viewed",
    icon: <Eye size={14} />,
  },
  shortlisted: {
    label: "Shortlisted",
    icon: <Star size={14} />,
  },
  rejected: {
    label: "Not Selected",
    icon: <XCircle size={14} />,
  },
  hired: {
    label: "Hired",
    icon: <CheckCircle2 size={14} />,
  },
  withdrawn: {
    label: "Withdrawn",
    icon: <Undo2 size={14} />,
  },
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "applied", label: "Applied" },
  { value: "viewed", label: "Viewed" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "rejected", label: "Not Selected" },
  { value: "hired", label: "Hired" },
  { value: "withdrawn", label: "Withdrawn" },
];

function ApplicationCard({
  app,
  fitScore,
  onWithdrawConfirm,
}: {
  app: Application;
  fitScore?: FitScore | null;
  onWithdrawConfirm: (id: string, jobTitle: string) => void;
}) {
  const cfg = STATUS_META[app.status];
  const [showScore, setShowScore] = useState(false);

  return (
    <div className="card-lifted p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="heading-card text-base text-[var(--text)]">{app.jobTitle}</h3>
            {app.companyName && (
              <span className="text-body text-sm text-white/65">at {app.companyName}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-body text-sm text-white/45">
            <span className="flex items-center gap-1">
              <Clock size={13} />
              Applied{" "}
              <span suppressHydrationWarning>
                {new Date(app.createdAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </span>
            {app.interest === "strong_interest" && (
              <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-xs font-semibold text-white/55 ring-1 ring-inset ring-white/[0.06]">
                Strong Interest
              </span>
            )}
            {app.appliedViaReferral && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.04] px-2 py-0.5 text-xs font-semibold text-white/55 ring-1 ring-inset ring-white/[0.06]"
                title="You applied using a referral link; the referrer may earn a bonus if you are hired."
              >
                <UserPlus size={12} aria-hidden />
                Referral
              </span>
            )}
          </div>
          {app.coverNote && (
            <div className="mt-2 flex items-start gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2">
              <MessageSquare size={14} className="mt-0.5 shrink-0 text-white/45" />
              <p className="text-body text-sm italic text-white/65">{app.coverNote}</p>
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {app.overallScore !== null && <FitRing score={app.overallScore} size={40} />}
          <StatusBadge tone={getApplicationStatusTone(app.status)} icon={cfg.icon}>
            {cfg.label}
          </StatusBadge>
          {app.status === "applied" && (
            <button
              type="button"
              onClick={() => onWithdrawConfirm(app.id, app.jobTitle)}
              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs font-semibold text-white/65 transition hover:border-red-500/30 hover:text-red-400"
            >
              Withdraw
            </button>
          )}
        </div>
      </div>
      {fitScore ? (
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <button
            type="button"
            onClick={() => setShowScore((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)]"
            aria-expanded={showScore}
          >
            {showScore ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            {showScore ? "Hide fit-score breakdown" : "View fit-score breakdown"}
          </button>
          {showScore ? (
            <div className="mt-4">
              <FitScoreReasoningPanel
                score={fitScore}
                candidateDisplayName={fitScore.candidateName}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function CandidateApplicationsPage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState("all");
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const [withdrawJobTitle, setWithdrawJobTitle] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [optimisticStatusById, setOptimisticStatusById] = useState<
    Record<string, ApplicationStatus>
  >({});
  const pendingWithdrawTimersRef = useRef<Record<string, number>>({});
  const [respondingOfferId, setRespondingOfferId] = useState<string | null>(null);
  const [offerComment, setOfferComment] = useState<Record<string, string>>({});

  const { data, loading, error, refetch } = useApiQuery<{
    applications: Record<string, unknown>[];
    pagination: { total: number };
  }>("/api/applications", filter !== "all" ? { status: filter } : undefined);

  const { data: stats } = useApiQuery<{
    total: number;
    responseRate: number;
    avgFitScore: number | null;
    highestScore: number | null;
  }>("/api/applications/stats");
  const { data: offersData, refetch: refetchOffers } = useApiQuery<{ offers: OfferRow[] }>(
    "/api/offers",
  );

  // Fit-score breakdowns (merged in from the former standalone Scores page),
  // keyed by job so each application can expand to its own breakdown.
  const { data: matchesData } = useApiQuery<{ matches: Record<string, unknown>[] }>(
    "/api/candidates/matches",
  );
  const scoreByJobId = useMemo(() => {
    const m = new Map<string, FitScore>();
    for (const raw of matchesData?.matches ?? []) {
      const score = mapDbFitScoreToView(raw);
      if (score.jobPostingId) m.set(score.jobPostingId, score);
    }
    return m;
  }, [matchesData]);

  const apps = useMemo(() => {
    const rows = data?.applications?.map(mapDbApplicationToView) ?? [];
    return rows.map((app) =>
      optimisticStatusById[app.id] ? { ...app, status: optimisticStatusById[app.id] } : app,
    );
  }, [data, optimisticStatusById]);

  const total = data?.pagination?.total ?? 0;
  const shortlisted = apps.filter((a) => a.status === "shortlisted").length;
  const viewed = apps.filter((a) => a.status === "viewed").length;
  const pending = apps.filter((a) => a.status === "applied").length;
  const activeOffers = (offersData?.offers ?? []).filter(
    (offer) => offer.status === "sent" || offer.status === "approved",
  );

  function openWithdrawConfirm(id: string, jobTitle: string) {
    setWithdrawId(id);
    setWithdrawJobTitle(jobTitle);
  }

  function closeWithdrawConfirm() {
    if (!withdrawing) {
      setWithdrawId(null);
      setWithdrawJobTitle("");
    }
  }

  useEffect(() => {
    return () => {
      Object.values(pendingWithdrawTimersRef.current).forEach((timer) =>
        window.clearTimeout(timer),
      );
      pendingWithdrawTimersRef.current = {};
    };
  }, []);

  async function handleWithdraw(id: string) {
    setWithdrawing(true);
    setWithdrawId(null);
    setWithdrawJobTitle("");
    setOptimisticStatusById((prev) => ({ ...prev, [id]: "withdrawn" }));

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/applications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "withdrawn" }),
        });
        if (!res.ok) {
          throw new Error("Failed to withdraw application");
        }
        setOptimisticStatusById((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        await refetch({ silent: true });
      } catch (error) {
        setOptimisticStatusById((prev) => {
          const { [id]: _, ...rest } = prev;
          return rest;
        });
        toast({
          title: "Couldn't withdraw application",
          description: error instanceof Error ? error.message : "Please try again.",
          tone: "error",
        });
      } finally {
        delete pendingWithdrawTimersRef.current[id];
      }
    }, 5000);
    pendingWithdrawTimersRef.current[id] = timer;
    toast({
      title: "Application will be withdrawn",
      description: "Undo within 5 seconds to keep your application active.",
      tone: "warning",
      duration: 5000,
      action: {
        label: "Undo",
        onClick: () => {
          const pendingTimer = pendingWithdrawTimersRef.current[id];
          if (pendingTimer) {
            window.clearTimeout(pendingTimer);
            delete pendingWithdrawTimersRef.current[id];
          }
          setOptimisticStatusById((prev) => {
            const { [id]: _, ...rest } = prev;
            return rest;
          });
          toast({
            title: "Withdrawal cancelled",
            tone: "info",
          });
        },
      },
    });
    setWithdrawing(false);
  }

  async function respondToOffer(offerId: string, response: "accept" | "decline") {
    setRespondingOfferId(offerId);
    try {
      const res = await fetch(`/api/offers/${offerId}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          response,
          comment: offerComment[offerId]?.trim() || undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast({
          title: "Couldn't submit offer response",
          description: payload.error || "Failed to submit offer response",
          tone: "error",
        });
        return;
      }
      toast({
        title: "Offer response submitted",
        tone: "success",
      });
      await refetchOffers();
    } finally {
      setRespondingOfferId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Status & Scores"
        subtitle="Track each application, see FitScore breakdowns, and check notifications for time-sensitive recruiter updates."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link
              href="/notifications"
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white"
            >
              Notifications
            </Link>
            <Link
              href="/candidate"
              className="flex items-center gap-1.5 rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white"
            >
              <ArrowLeft size={14} />
              Back to Feed
            </Link>
          </div>
        }
      />
      {loading ? (
        <div className="mx-auto max-w-5xl space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="card-lifted p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-6 w-12" />
              </div>
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="card-lifted p-5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-3 h-3 w-2/3" />
                <Skeleton className="mt-4 h-8 w-full" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="mx-auto max-w-md rounded-xl border border-red-500/20 bg-red-500/5 px-6 py-12 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 rounded-md border border-[var(--border)] px-4 py-2 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
          >
            Retry
          </button>
        </div>
      ) : (
        <div className="mx-auto max-w-5xl space-y-6">
          {activeOffers.length > 0 ? (
            <section className="card-lifted space-y-3 p-4">
              <h2 className="heading-card text-base text-[var(--text)]">
                Offers awaiting your response
              </h2>
              {activeOffers.map((offer) => (
                <div key={offer.id} className="card-lifted space-y-2 p-3">
                  <p className="text-sm font-semibold text-[var(--text)]">{offer.role_title}</p>
                  <p className="text-xs text-white/65">
                    Status: {offer.status} • starts{" "}
                    <span suppressHydrationWarning>
                      {new Date(offer.start_date).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </span>
                    {offer.expires_at ? (
                      <>
                        {" "}
                        • expires{" "}
                        <span suppressHydrationWarning>
                          {new Date(offer.expires_at).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                      </>
                    ) : null}
                  </p>
                  <input
                    type="text"
                    value={offerComment[offer.id] ?? ""}
                    onChange={(event) =>
                      setOfferComment((prev) => ({
                        ...prev,
                        [offer.id]: event.target.value,
                      }))
                    }
                    placeholder="Comment for recruiter (optional)"
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={Boolean(respondingOfferId)}
                      onClick={() => respondToOffer(offer.id, "accept")}
                      className="rounded-md bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                    >
                      {respondingOfferId === offer.id ? "Submitting..." : "Accept"}
                    </button>
                    <button
                      type="button"
                      disabled={Boolean(respondingOfferId)}
                      onClick={() => respondToOffer(offer.id, "decline")}
                      className="rounded-md bg-red-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total Applications" value={total} icon={<Send size={20} />} />
            <StatCard label="Pending Review" value={pending} icon={<Clock size={20} />} />
            <StatCard label="Viewed" value={viewed} icon={<Eye size={20} />} />
            <StatCard label="Shortlisted" value={shortlisted} icon={<Star size={20} />} />
            <StatCard
              label="Response Rate"
              value={stats?.responseRate != null ? `${stats.responseRate}%` : "—"}
              icon={<TrendingUp size={20} />}
            />
            <div className="card-lifted rounded-xl p-5">
              <div className="grid h-full grid-cols-[minmax(0,1fr)_auto] grid-rows-[3.75rem_auto] gap-x-3">
                <p className="text-body text-sm font-normal leading-5 text-white/60">Best Score</p>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
                  <BarChart3 size={20} />
                </div>
                <div className="row-start-2 mt-auto flex min-h-[2.5rem] items-center justify-start pt-1">
                  {stats?.highestScore != null ? (
                    <FitRing score={stats.highestScore} size={40} />
                  ) : (
                    <span className="text-2xl leading-none font-extrabold text-white/45">—</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFilter(opt.value)}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  filter === opt.value
                    ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
                    : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {apps.length === 0 ? (
            <div className="card-lifted p-12 text-center">
              <p className="text-body text-sm text-white/65">
                {filter === "all"
                  ? "No applications yet. Go to your Match Feed to express interest in jobs!"
                  : `No ${filter} applications found.`}
              </p>
              {filter === "all" && (
                <Link
                  href="/candidate"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
                >
                  Go to Match Feed
                  <ArrowLeft size={14} className="rotate-180" />
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((app) => (
                <ApplicationCard
                  key={app.id}
                  app={app}
                  fitScore={scoreByJobId.get(app.jobId) ?? null}
                  onWithdrawConfirm={openWithdrawConfirm}
                />
              ))}
            </div>
          )}

          {withdrawId && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="withdraw-dialog-title"
            >
              <div className="card-lifted w-full max-w-md p-6 shadow-xl">
                <div className="flex gap-3">
                  <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" aria-hidden />
                  <div>
                    <h2
                      id="withdraw-dialog-title"
                      className="heading-card text-lg text-[var(--text)]"
                    >
                      Withdraw application?
                    </h2>
                    <p className="mt-2 text-body text-sm text-white/65">
                      This will withdraw your application for <strong>{withdrawJobTitle}</strong>.
                      The recruiter will be notified. You can undo for 5 seconds after confirming.
                    </p>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeWithdrawConfirm}
                    disabled={withdrawing}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/[0.04] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => handleWithdraw(withdrawId)}
                    disabled={withdrawing}
                    className="rounded-md bg-red-500/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {withdrawing ? (
                      <span className="flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Withdrawing…
                      </span>
                    ) : (
                      "Withdraw"
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
