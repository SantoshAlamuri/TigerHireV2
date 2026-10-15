"use client";

/**
 * Candidate match feed — the candidate's daily home.
 * Uses the "alive" design system (alive-air, card-lifted, FitRing).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap,
  User,
  Trophy,
  Calendar,
  Lock,
  ArrowRight,
  Send,
  Heart,
  CheckCircle2,
  Gift,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import FitRing from "@/components/ui/FitRing";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { mapDbFitScoreToView } from "@/lib/mappers";
import type { FitScore } from "@/types";
import {
  candidateProfileCompleteness,
  CANDIDATE_ONBOARDING_DISMISS_KEY,
} from "@/lib/candidate/profile-completeness";

/** One-time flag so the "we linked your earlier activity" notice shows once. */
const CANDIDATE_ACTIVITY_LINKED_KEY = "th.candidate.activityLinkedSeen";

const DIMENSION_KEYS = [
  "skillsMatch",
  "experienceRelevance",
  "seniorityAlignment",
  "locationAvailability",
  "signalFreshness",
] as const;

const DIMENSION_SHORT_LABELS: Record<(typeof DIMENSION_KEYS)[number], string> = {
  skillsMatch: "Skills",
  experienceRelevance: "Experience",
  seniorityAlignment: "Seniority",
  locationAvailability: "Location",
  signalFreshness: "Freshness",
};

const CARD_BASE = "card-lifted";
const CARD_HOVER = "card-lifted-hover";

const NEUTRAL_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f1014]";

const TABULAR = "tabular-nums [font-variant-numeric:tabular-nums]";

function MiniBars({ score }: { score: FitScore }) {
  // The fixed 5-dimension scorer keys `dimensions` by these keys, but the live
  // criteria-based scorer keys them by criterion_id (with the human label on each
  // entry). Use the fixed keys when present; otherwise fall back to whatever
  // dimensions actually exist. Never index a missing key — that crashed the feed.
  const dimensionsMap = score.dimensions ?? {};
  const fixed = DIMENSION_KEYS.map((key) => {
    const dim = dimensionsMap[key];
    return dim ? { label: DIMENSION_SHORT_LABELS[key], score: dim.score } : null;
  }).filter((d): d is { label: string; score: number } => d != null);
  const bars =
    fixed.length > 0
      ? fixed
      : Object.values(dimensionsMap)
          .filter((d) => d && typeof d.score === "number")
          .slice(0, 6)
          .map((d) => ({ label: d.label || "—", score: d.score }));

  if (bars.length === 0) return null;

  return (
    <div className="grid grid-cols-3 gap-x-5 gap-y-2">
      {bars.map((dim, i) => {
        const barTone =
          dim.score >= 80
            ? "bg-emerald-400/85"
            : dim.score >= 60
              ? "bg-amber-300/85"
              : "bg-rose-400/85";
        return (
          <div key={`${dim.label}-${i}`} className="flex items-center gap-2.5">
            <span
              title={dim.label}
              className="w-16 shrink-0 truncate text-[11px] uppercase tracking-wider text-white/40"
            >
              {dim.label}
            </span>
            <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div className={`h-full ${barTone}`} style={{ width: `${dim.score}%` }} />
            </div>
            <span className={`w-7 shrink-0 text-right text-xs ${TABULAR} text-white/70`}>
              {dim.score}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ApplyButtonProps {
  score: FitScore;
  appliedJobIds: Set<string>;
  onApplied: (jobId: string) => void;
  onOptimisticAppliedChange: (jobId: string, applied: boolean) => void;
}

function ApplyButton({
  score,
  appliedJobIds,
  onApplied,
  onOptimisticAppliedChange,
}: ApplyButtonProps) {
  const { toast } = useToast();
  const { mutate } = useOptimisticMutation<
    Record<string, unknown>,
    { jobId: string; fitScoreId: string; interest: "interested" }
  >("/api/applications", {
    onMutate: () => {
      onOptimisticAppliedChange(score.jobPostingId, true);
      return () => onOptimisticAppliedChange(score.jobPostingId, false);
    },
    onSuccess: () => {
      onApplied(score.jobPostingId);
      toast({
        title: "Application sent",
        description: `${score.jobTitle} at ${score.companyName}`,
        tone: "success",
      });
    },
    onError: (err) => {
      toast({
        title: "Couldn't send application",
        description: err.message,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => {
            void handleApply();
          },
        },
      });
    },
  });

  const alreadyApplied = appliedJobIds.has(score.jobPostingId);

  async function handleApply() {
    await mutate({
      jobId: score.jobPostingId,
      fitScoreId: score.id,
      interest: "interested",
    });
  }

  if (alreadyApplied) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/20">
        <CheckCircle2 size={12} />
        Applied
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleApply}
        className={`group inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${NEUTRAL_RING}`}
      >
        <Heart size={14} />
        I&apos;m Interested
      </button>
    </div>
  );
}

export default function CandidateMatchFeedPage() {
  const { user } = useAuth();

  const { data: matchesData, loading } = useApiQuery<{
    matches: Record<string, unknown>[];
  }>("/api/candidates/matches");

  const { data: appsData } = useApiQuery<{
    applications: { job_id: string }[];
  }>("/api/applications", { limit: 200 });

  const { data: profileData } = useApiQuery<{ profile: Record<string, unknown> | null }>(
    "/api/profiles",
  );
  const { data: prefsData } = useApiQuery<{
    preferences: {
      remote_preference?: string;
      preferred_role_functions?: string[];
      preferred_seniority?: string[];
      salary_min_lpa?: number;
    } | null;
  }>("/api/candidates/me/preferences");

  const router = useRouter();
  const profile = profileData?.profile ?? null;

  const completeness = useMemo(() => {
    const pf = prefsData?.preferences;
    const hasPreferences = Boolean(
      (pf?.preferred_role_functions?.length ?? 0) > 0 ||
      (pf?.preferred_seniority?.length ?? 0) > 0 ||
      (pf?.salary_min_lpa ?? 0) > 0 ||
      (pf?.remote_preference && pf.remote_preference !== "any"),
    );
    return candidateProfileCompleteness({
      fullName: profile?.full_name as string | undefined,
      roleTitle: (profile?.role_title as string) || (profile?.current_role as string),
      location: profile?.location as string | undefined,
      skills: profile?.skills as string[] | undefined,
      experienceYears: profile?.experience_years as number | undefined,
      resumeUrl: profile?.resume_url as string | undefined,
      linkedinUrl: profile?.linkedin_url as string | undefined,
      hasPreferences,
    });
  }, [profile, prefsData]);

  // Soft first-run: route a brand-new (no résumé) candidate into guided onboarding
  // once, unless they've explicitly skipped it. The banner below handles the rest.
  useEffect(() => {
    if (!profile || typeof window === "undefined") return;
    const dismissed = window.localStorage.getItem(CANDIDATE_ONBOARDING_DISMISS_KEY) === "1";
    if (!dismissed && !(profile.resume_url as string | null | undefined)) {
      router.replace("/candidate/onboarding");
    }
  }, [profile, router]);

  const [localAppliedIds, setLocalAppliedIds] = useState<Set<string>>(new Set());

  // One-time reassurance that an externally-sourced (WhatsApp/referral) application
  // is now linked to this account. Start "dismissed" to avoid a flash before the
  // localStorage check resolves.
  const [activityLinkedDismissed, setActivityLinkedDismissed] = useState(true);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setActivityLinkedDismissed(window.localStorage.getItem(CANDIDATE_ACTIVITY_LINKED_KEY) === "1");
  }, []);
  function dismissActivityLinked() {
    try {
      window.localStorage.setItem(CANDIDATE_ACTIVITY_LINKED_KEY, "1");
    } catch {
      /* private mode */
    }
    setActivityLinkedDismissed(true);
  }

  const myScores = useMemo(
    () => matchesData?.matches?.map(mapDbFitScoreToView) ?? [],
    [matchesData],
  );

  const appliedJobIds = useMemo(() => {
    const ids = new Set(localAppliedIds);
    appsData?.applications?.forEach((a) => ids.add(a.job_id));
    return ids;
  }, [appsData, localAppliedIds]);

  const appliedCount = appliedJobIds.size;
  const matchCount = myScores.length;
  const bestScore = useMemo(
    () => (myScores.length > 0 ? Math.max(...myScores.map((s) => s.overallScore)) : 0),
    [myScores],
  );

  function handleApplied(jobId: string) {
    setLocalAppliedIds((prev) => new Set(prev).add(jobId));
  }

  function handleOptimisticAppliedChange(jobId: string, applied: boolean) {
    setLocalAppliedIds((prev) => {
      const next = new Set(prev);
      if (applied) {
        next.add(jobId);
      } else {
        next.delete(jobId);
      }
      return next;
    });
  }

  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title="Match Feed"
        subtitle={`Welcome back${user?.name ? `, ${user.name.split(" ")[0]}` : ""}. Your score becomes visible after you apply to a role.`}
      />
      {loading ? (
        <div className="mx-auto max-w-6xl space-y-10">
          <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className="card-lifted alive-halo space-y-6 p-8">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-24 w-48" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-full max-w-md" />
                <Skeleton className="h-3 w-5/6 max-w-md" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="card-lifted flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="h-7 w-7" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                  <Skeleton className="h-5 w-8" />
                </div>
              ))}
            </div>
          </section>

          <div className="card-lifted flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9" />
              <div className="space-y-2">
                <Skeleton className="h-3 w-56" />
                <Skeleton className="h-2.5 w-32" />
              </div>
            </div>
            <Skeleton className="h-8 w-32" />
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-6 w-48" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="card-lifted p-5">
                <div className="flex justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-4 w-2/3 max-w-sm" />
                    <Skeleton className="h-3 w-24" />
                    <div className="mt-4 grid grid-cols-3 gap-x-5 gap-y-2">
                      {[0, 1, 2, 3, 4].map((j) => (
                        <div key={j} className="flex items-center gap-2.5">
                          <Skeleton className="h-2.5 w-14" />
                          <Skeleton className="h-[3px] flex-1" />
                          <Skeleton className="h-2.5 w-6" />
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Skeleton shape="circle" className="h-14 w-14" />
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-9 w-32" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-6xl space-y-10">
          {!completeness.setupComplete ? (
            <Link
              href="/candidate/onboarding"
              className={`${CARD_BASE} group flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-[color:var(--status-warning-border)] bg-[color:var(--status-warning-bg)] px-5 py-4 ${NEUTRAL_RING}`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)]/15 text-[var(--accent)]">
                  <User size={16} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">
                    Finish your profile — {completeness.pct}% complete
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {completeness.requiredMissing.length} step
                    {completeness.requiredMissing.length === 1 ? "" : "s"} left to unlock stronger
                    matches.
                  </p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)]">
                Continue setup
                <ArrowRight
                  size={15}
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </Link>
          ) : null}
          {appliedCount > 0 && !activityLinkedDismissed ? (
            <div
              className={`${CARD_BASE} flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-md)] border-[color:var(--status-success-border)] bg-[color:var(--status-success-bg)] px-5 py-4`}
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[color:var(--status-success-fg)]">
                  <CheckCircle2 size={18} />
                </span>
                <p className="text-sm text-[var(--text)]">
                  We found your earlier application{appliedCount === 1 ? "" : "s"} —
                  everything&apos;s linked to this account now.
                </p>
              </div>
              <button
                type="button"
                onClick={dismissActivityLinked}
                className={`rounded-md px-3 py-1.5 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--text)] ${NEUTRAL_RING}`}
              >
                Got it
              </button>
            </div>
          ) : null}
          <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <div className={`${CARD_BASE} alive-halo relative overflow-hidden p-8`}>
              <div className="flex items-baseline gap-3">
                <p className="text-sm font-normal text-white/50">Welcome back</p>
                {firstName && (
                  <p className="text-sm font-extrabold tracking-tight text-white">{firstName}.</p>
                )}
              </div>

              <div className="mt-6 flex items-end gap-4">
                <span
                  className={`text-[7rem] leading-none font-extrabold tracking-[-0.06em] ${TABULAR} ${
                    bestScore >= 80
                      ? "text-[var(--accent)]"
                      : bestScore >= 60
                        ? "text-[#d97706]"
                        : bestScore > 0
                          ? "text-[#fb7185]"
                          : "text-white/20"
                  }`}
                  style={
                    bestScore >= 80 ? { textShadow: "0 0 40px rgba(245,158,11,0.35)" } : undefined
                  }
                >
                  {bestScore > 0 ? bestScore : "—"}
                </span>
                <div className="pb-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/40">Best match</p>
                  <p className="mt-1 text-sm font-normal text-white/60">
                    out of <span className={TABULAR}>100</span>
                  </p>
                </div>
              </div>

              <p className="mt-6 max-w-md text-sm font-normal leading-relaxed text-white/55">
                Higher fit means a stronger signal to recruiters — and faster routing through
                pipeline.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <StatRow label="Matches found" value={matchCount} icon={<Zap size={14} />} />
              <StatRow
                label="Applications sent"
                value={appliedCount}
                icon={<Send size={14} />}
                href={appliedCount > 0 ? "/candidate/applications" : undefined}
              />
              <StatRow
                label="Profile strength"
                value={`${completeness.pct}%`}
                icon={<User size={14} />}
                href="/candidate/onboarding"
                accent={completeness.pct >= 80}
              />
              <StatRow
                label="Top fit"
                value={bestScore > 0 ? bestScore : "—"}
                icon={<Trophy size={14} />}
                accent={bestScore >= 80}
              />
            </div>
          </section>

          <section className={`${CARD_BASE} ${CARD_HOVER} alive-halo relative overflow-hidden p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[var(--accent)]/15 text-[var(--accent)] ring-1 ring-inset ring-[var(--accent)]/30">
                  <Gift size={16} />
                </span>
                <div>
                  <p className="text-sm font-extrabold text-white">
                    Refer & earn.{" "}
                    <span className="font-normal text-white/55">
                      Vouch for someone, get paid when they&apos;re hired.
                    </span>
                  </p>
                  <p className={`mt-0.5 text-xs text-white/40 ${TABULAR}`}>
                    One-time WhatsApp verify. Then share your link.
                  </p>
                </div>
              </div>
              <Link
                href="/dashboard/referrer"
                className={`inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-bold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] ${NEUTRAL_RING}`}
              >
                <Gift size={14} />
                Start referring
                <ArrowRight size={14} />
              </Link>
            </div>
          </section>

          <section>
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                  <span className="mr-1.5 inline-block h-[5px] w-[5px] rounded-full bg-[#f59e0b] align-middle shadow-[0_0_8px_rgba(245,158,11,0.7)] animate-[pulse_2s_ease-in-out_infinite]" />
                  Live feed
                </p>
                <h2 className="mt-1 text-2xl tracking-tight text-white">
                  <span className="font-normal text-white/60">Your</span>{" "}
                  <span className="font-extrabold">match feed</span>
                </h2>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  href="/candidate/preferences"
                  className={`rounded-md px-3 py-1.5 text-sm font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white ${NEUTRAL_RING}`}
                >
                  Preferences
                </Link>
                {appliedCount > 0 && (
                  <Link
                    href="/candidate/applications"
                    className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-white/55 transition hover:bg-white/[0.04] hover:text-white ${NEUTRAL_RING}`}
                  >
                    My applications
                    <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>

            {myScores.length === 0 ? (
              <div className={`${CARD_BASE} px-6 py-16 text-center`}>
                <p className="text-sm font-normal text-white/50">
                  No matches yet.{" "}
                  <Link
                    href="/candidate/onboarding"
                    className="font-semibold text-white underline-offset-4 hover:underline"
                  >
                    Complete your profile
                  </Link>{" "}
                  to start receiving them.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {myScores.map((score) => {
                  const canViewScore = appliedJobIds.has(score.jobPostingId);
                  return (
                    <article key={score.id} className={`${CARD_BASE} ${CARD_HOVER} p-5`}>
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                            <h3 className="text-base font-extrabold tracking-tight text-white">
                              {score.jobTitle}
                            </h3>
                            <span className="text-sm font-normal text-white/45">
                              at {score.companyName}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-white/35">
                            <span className="inline-flex items-center gap-1">
                              <Calendar size={11} />
                              <span suppressHydrationWarning className={TABULAR}>
                                {new Date(score.scoredAt).toLocaleDateString("en-GB", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </span>
                          </div>
                          {canViewScore && (
                            <div className="mt-4">
                              <MiniBars score={score} />
                            </div>
                          )}
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-3">
                          {canViewScore ? (
                            <>
                              <FitRing score={score.overallScore} size={56} />
                              <Link
                                href="/candidate/applications"
                                className={`inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white ${NEUTRAL_RING}`}
                              >
                                Details
                                <ArrowRight size={12} />
                              </Link>
                              <ApplyButton
                                score={score}
                                appliedJobIds={appliedJobIds}
                                onApplied={handleApplied}
                                onOptimisticAppliedChange={handleOptimisticAppliedChange}
                              />
                            </>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1.5 rounded-md bg-white/[0.03] px-2.5 py-1 text-xs font-medium text-white/45 ring-1 ring-inset ring-white/[0.06]">
                                <Lock size={11} />
                                Apply to reveal score
                              </span>
                              <ApplyButton
                                score={score}
                                appliedJobIds={appliedJobIds}
                                onApplied={handleApplied}
                                onOptimisticAppliedChange={handleOptimisticAppliedChange}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function StatRow({
  label,
  value,
  icon,
  href,
  accent = false,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  href?: string;
  accent?: boolean;
}) {
  const inner = (
    <div
      className={`${CARD_BASE} ${href ? CARD_HOVER : ""} flex items-center justify-between gap-3 px-4 py-3`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.04] text-white/55 ring-1 ring-inset ring-white/[0.06]">
          {icon}
        </span>
        <span className="text-sm font-normal text-white/55">{label}</span>
      </div>
      <span
        className={`text-xl font-extrabold ${TABULAR} ${accent ? "text-[var(--accent)]" : "text-white"}`}
        style={accent ? { textShadow: "0 0 40px rgba(245,158,11,0.35)" } : undefined}
      >
        {value}
      </span>
    </div>
  );

  if (!href) return inner;
  return (
    <Link href={href} className={`block rounded-xl ${NEUTRAL_RING}`}>
      {inner}
    </Link>
  );
}
