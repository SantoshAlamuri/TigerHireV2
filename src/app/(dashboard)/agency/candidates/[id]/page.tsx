"use client";

import { useParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  MapPin,
  Building2,
  Briefcase,
  Clock,
  IndianRupee,
  CheckCircle2,
  HelpCircle,
  Radio,
  ArrowLeft,
  Loader2,
  BarChart3,
} from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { FitScoreBlendAndInterviewExtras } from "@/components/dashboard/FitScoreBlendAndInterviewExtras";
import { FitScoreReasoningPanel } from "@/components/dashboard/FitScoreReasoningPanel";
import { CandidateNotesSection } from "@/components/dashboard/CandidateNotesSection";
import { CandidateResumeAccess } from "@/components/dashboard/CandidateResumeAccess";
import { CandidateScreeningCard } from "@/components/dashboard/CandidateScreeningCard";
import FitRing from "@/components/ui/FitRing";
import { CandidateProfileIdentityHeader } from "@/components/dashboard/CandidateProfileIdentityHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery, useOptimisticMutation } from "@/lib/hooks/use-api";
import { normalizeContactDetail } from "@/lib/candidates/normalize-contact-detail";
import { mapDbCandidateToView, mapDbFitScoreToView } from "@/lib/mappers";
import { screeningFlagLabel } from "@/lib/screening/candidate-flag";

function formatSalary(value: number): string {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  return `₹${value.toLocaleString()}`;
}

function screeningFlagClass(flag: string): string {
  switch (flag) {
    case "completed":
      return "text-emerald-300";
    case "in_progress":
      return "text-blue-300";
    case "attention":
      return "text-amber-300";
    default:
      return "text-white/60";
  }
}

export default function AgencyCandidateDetailPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";

  const {
    data: candidateData,
    loading,
    error,
  } = useApiQuery<{ candidate: Record<string, unknown>; isUnlocked?: boolean }>(
    params.id ? `/api/candidates/${params.id}` : null,
  );

  const { data: scoresData, refetch: refetchScores } = useApiQuery<{
    scores: Record<string, unknown>[];
  }>(params.id ? "/api/fit-score" : null, params.id ? { candidateId: params.id } : undefined);

  const { data: resumesData } = useApiQuery<{
    versions: Array<{ id: string; file_name: string; view_url?: string; created_at?: string }>;
  }>(params.id ? `/api/candidates/${params.id}/resumes` : null);

  const scoringRef = useRef(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [selectedScoreId, setSelectedScoreId] = useState<string | null>(null);
  const { mutate: scoreCandidate, loading: scoring } = useOptimisticMutation<
    {
      results?: Array<{
        success: boolean;
        error?: string;
        score?: number | null;
      }>;
    },
    { candidateIds: string[] }
  >("/api/agency/reprocess-candidates", {
    method: "POST",
    onMutate: () => {
      scoringRef.current = true;
      setScoreError(null);
      return () => {
        scoringRef.current = false;
      };
    },
    onSuccess: async (response) => {
      const first = response.results?.[0];
      if (first && !first.success) {
        setScoreError(first.error ?? "Scoring failed");
        toast({
          title: "Scoring failed",
          description: first.error ?? "Try again in a moment.",
          tone: "error",
        });
      } else {
        await refetchScores();
        toast({
          title: "Score updated",
          description: "Candidate fit scores were refreshed.",
          tone: "success",
        });
      }
      scoringRef.current = false;
    },
    onError: (err) => {
      setScoreError(err.message);
      scoringRef.current = false;
      toast({
        title: "Couldn't score candidate",
        description: err.message,
        tone: "error",
      });
    },
  });

  const handleScoreNow = useCallback(async () => {
    if (!params.id || scoringRef.current) return;
    await scoreCandidate({ candidateIds: [params.id] });
  }, [params.id, scoreCandidate]);

  const fitScores = useMemo(() => scoresData?.scores?.map(mapDbFitScoreToView) ?? [], [scoresData]);
  const sortedFitScores = useMemo(
    () => [...fitScores].sort((a, b) => b.overallScore - a.overallScore),
    [fitScores],
  );
  const headlineFitScore = sortedFitScores[0]?.overallScore ?? null;
  const selectedScore = useMemo(() => {
    if (sortedFitScores.length === 0) return null;
    if (selectedScoreId) {
      const found = sortedFitScores.find((s) => s.id === selectedScoreId);
      if (found) return found;
    }
    return sortedFitScores[0];
  }, [sortedFitScores, selectedScoreId]);

  if (loading) {
    return (
      <>
        <PageHeader title="Candidate" subtitle="Loading..." />
        <div className="space-y-4">
          <div className="card-lifted p-6">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="mt-3 h-4 w-1/2" />
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          </div>
          <div className="card-lifted p-5">
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="mt-3 h-3 w-2/3" />
          </div>
        </div>
      </>
    );
  }

  const candidateRaw = candidateData?.candidate;

  if (error || !candidateRaw) {
    return (
      <>
        <PageHeader title="Candidate" subtitle="Not found" />
        <div className="card-lifted p-12 text-center">
          <p className="heading-card text-lg text-[var(--text)]">Candidate not found</p>
          <p className="text-body mt-2 text-sm text-white/60">
            No candidate exists with ID &ldquo;{params.id}&rdquo;
          </p>
          <Link
            href="/agency/pipeline"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-[var(--accent)] hover:underline"
          >
            <ArrowLeft size={16} />
            Back to pipeline
          </Link>
        </div>
      </>
    );
  }

  const candidate = mapDbCandidateToView(candidateRaw);
  const screeningFlag = candidate.screeningFlag ?? "not_started";
  const candidateUnlocked = Boolean(candidateData?.isUnlocked);
  const displayName = candidate.claimed ? candidate.name : candidate.nameMasked;
  const cvRawText =
    typeof candidateRaw.cv_raw_text === "string" ? candidateRaw.cv_raw_text.trim() : "";
  const legacyResumeUrl =
    (typeof candidateRaw.resume_url === "string" && candidateRaw.resume_url.trim()) ||
    (typeof candidateRaw.cv_url === "string" && candidateRaw.cv_url.trim()) ||
    "";
  const rawExtras = candidateRaw as Record<string, unknown>;
  const unlockedEmail = candidateUnlocked ? normalizeContactDetail(candidateRaw.email) : null;
  const unlockedPhone = candidateUnlocked
    ? (normalizeContactDetail(candidateRaw.phone) ??
      normalizeContactDetail(rawExtras.mobile) ??
      normalizeContactDetail(rawExtras.phone_number) ??
      normalizeContactDetail(rawExtras.mobile_number))
    : null;

  const emailDisplay = candidateUnlocked ? (unlockedEmail ?? "—") : "Unlock to view";
  const phoneDisplay = candidateUnlocked ? (unlockedPhone ?? "—") : "Unlock to view";
  const emailHref = candidateUnlocked && unlockedEmail ? `mailto:${unlockedEmail}` : null;
  // A CV is stored but never made it into the profile (parse rejected or still
  // queued). Without this the recruiter sees "—" everywhere and, once any score
  // exists, has no button left to re-run the parse.
  const cvNeverParsed = Boolean(legacyResumeUrl) && !candidateRaw.cv_parsed_at;
  const cvParseFailed = candidateRaw.processing_status === "failed";
  const cvParseRunning = candidateRaw.processing_status === "processing";
  const phoneHref =
    candidateUnlocked && unlockedPhone ? `tel:${String(unlockedPhone).replace(/\s/g, "")}` : null;

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Link
          href="/agency/pipeline"
          className="flex items-center gap-2 rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
        >
          <ArrowLeft size={16} />
          Back to pipeline
        </Link>
      </div>
      <div className="space-y-8">
        {fitScores.length === 0 ? (
          <div className="card-lifted p-4">
            <p className="text-body mb-3 text-xs font-semibold uppercase tracking-wider text-white/60">
              Fit score
            </p>
            <div className="space-y-3">
              <p className="text-body text-sm text-white/60">
                No fit scores yet. Score this candidate against open jobs for your clients.
              </p>
              {scoreError && <p className="text-sm text-red-400">{scoreError}</p>}
              <button
                type="button"
                onClick={handleScoreNow}
                disabled={scoring}
                className="flex items-center gap-2 rounded-lg border border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-2 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scoring ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Scoring...
                  </>
                ) : (
                  <>
                    <BarChart3 size={16} />
                    Score now
                  </>
                )}
              </button>
            </div>
          </div>
        ) : null}

        {cvNeverParsed ? (
          <div
            role="status"
            className="card-lifted flex flex-wrap items-center justify-between gap-3 border border-amber-500/30 bg-amber-500/10 p-4"
          >
            <p className="text-sm text-amber-100">
              {cvParseFailed
                ? "We could not read this CV into a profile, so contact details, skills and experience are missing."
                : cvParseRunning
                  ? "Reading the CV into the profile now — refresh this page in about a minute."
                  : "Profile details are still being read from the CV. If this persists, re-read it now."}
            </p>
            {cvParseRunning ? null : (
              <button
                type="button"
                onClick={handleScoreNow}
                disabled={scoring}
                className="flex items-center gap-2 rounded-lg border border-amber-400/60 px-3 py-1.5 text-sm font-medium text-amber-100 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {scoring ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                {scoring ? "Re-reading CV..." : "Re-read CV & rescore"}
              </button>
            )}
          </div>
        ) : null}

        <div className="card-lifted p-6 md:p-7">
          <CandidateProfileIdentityHeader
            displayName={displayName}
            roleTitle={candidate.roleTitle}
            profileCompleteness={candidate.profileCompleteness}
            emailDisplay={emailDisplay}
            phoneDisplay={phoneDisplay}
            emailHref={emailHref}
            phoneHref={phoneHref}
            aside={
              headlineFitScore != null ? (
                <div className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                  <FitRing
                    score={headlineFitScore}
                    size={32}
                    showLabel={false}
                    showCenterValue={false}
                  />
                  <div className="flex flex-col leading-none">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45">
                      Top fit
                    </span>
                    <span className="text-sm font-semibold tabular-nums text-[var(--text)]">
                      {headlineFitScore}
                    </span>
                  </div>
                </div>
              ) : null
            }
            nameRowAside={
              <CandidateResumeAccess
                candidateId={params.id}
                variant="inline"
                versions={resumesData?.versions ?? []}
                cvRawText={cvRawText}
                legacyResumeUrl={legacyResumeUrl}
              />
            }
          />

          <div className="mt-6 grid grid-cols-2 gap-3 md:gap-4 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 [&>div]:flex [&>div]:min-w-0 [&>div]:items-center [&>div]:gap-2.5 [&>div]:rounded-xl [&>div]:border [&>div]:border-white/[0.06] [&>div]:bg-white/[0.025] [&>div]:px-3 [&>div]:py-2.5 [&>div]:text-sm [&>div]:text-white/60">
            <div>
              <Building2 size={16} className="shrink-0 text-[var(--accent)]" />
              <span className="min-w-0 truncate">{candidate.currentCompany || "—"}</span>
            </div>
            <div>
              <MapPin size={16} className="shrink-0 text-[var(--accent)]" />
              {candidate.locationCity || candidate.locationState
                ? `${candidate.locationCity}${candidate.locationState ? `, ${candidate.locationState}` : ""}`
                : "—"}
            </div>
            <div>
              <Briefcase size={16} className="shrink-0 text-[var(--accent)]" />
              {candidate.seniorityLevel}
            </div>
            <div>
              <Clock size={16} className="shrink-0 text-[var(--accent)]" />
              {candidate.yearsExperience} yrs exp
            </div>
            <div>
              <IndianRupee size={16} className="shrink-0 text-[var(--accent)]" />
              <span suppressHydrationWarning>
                {candidate.salaryMinInferred > 0 || candidate.salaryMaxInferred > 0
                  ? `${formatSalary(candidate.salaryMinInferred)} – ${formatSalary(candidate.salaryMaxInferred)}`
                  : "Not disclosed"}
              </span>
            </div>
            <div>
              <CheckCircle2 size={16} className={`shrink-0 ${screeningFlagClass(screeningFlag)}`} />
              <span className={`min-w-0 truncate ${screeningFlagClass(screeningFlag)}`}>
                {screeningFlagLabel(screeningFlag)}
              </span>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-body mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              Skills
            </p>
            <div className="flex flex-wrap gap-2">
              {candidate.skillsVerified.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400"
                >
                  <CheckCircle2 size={12} />
                  {skill}
                </span>
              ))}
              {candidate.skillsInferred.map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-white/60"
                >
                  <HelpCircle size={12} />
                  {skill}
                </span>
              ))}
              {candidate.skillsVerified.length === 0 && candidate.skillsInferred.length === 0 && (
                <span className="text-body text-xs text-white/60">No skills data available</span>
              )}
            </div>
          </div>

          {candidate.signalSources.length > 0 && (
            <div className="mt-6">
              <p className="text-body mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">
                Signal Sources
              </p>
              <div className="flex flex-wrap gap-2">
                {candidate.signalSources.map((source) => (
                  <span
                    key={source}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-white/60"
                  >
                    <Radio size={10} />
                    {source}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {fitScores.length > 0 && selectedScore ? (
          <div>
            <h2 className="heading-section mb-4 text-lg text-[var(--text)]">
              Scores (<span suppressHydrationWarning>{fitScores.length.toLocaleString()}</span>)
            </h2>
            {sortedFitScores.length > 1 ? (
              <div className="mb-4 flex flex-wrap gap-2">
                {sortedFitScores.map((s) => {
                  const active = s.id === selectedScore.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedScoreId(s.id)}
                      className={`flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 text-left text-sm transition ${
                        active
                          ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]"
                          : "border-[var(--border)] bg-[var(--bg-elevated)]/60 text-white/60 hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
                      }`}
                    >
                      <FitRing score={s.overallScore} size={30} showLabel={false} />
                      <span className="min-w-0 truncate font-medium">{s.jobTitle}</span>
                      <span
                        className={`shrink-0 tabular-nums ${active ? "text-[var(--accent)]" : ""}`}
                      >
                        {s.overallScore}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : null}
            <div key={selectedScore.id} className="space-y-4">
              <FitScoreReasoningPanel
                score={selectedScore}
                showSuperAdminDiagnostics={isSuperAdmin}
                candidateDisplayName={
                  candidateUnlocked
                    ? selectedScore.candidateName
                    : selectedScore.candidateNameMasked
                }
              />
              <FitScoreBlendAndInterviewExtras
                score={selectedScore}
                onRefetch={refetchScores}
                showAlternateScoreControls={isSuperAdmin}
              />
            </div>
          </div>
        ) : null}

        {params.id && (
          <div className="mt-6">
            <CandidateNotesSection candidateId={params.id} />
          </div>
        )}

        {params.id && (
          <div className="mt-6">
            <CandidateScreeningCard candidateId={params.id} canOverride={false} />
          </div>
        )}
      </div>
    </>
  );
}
