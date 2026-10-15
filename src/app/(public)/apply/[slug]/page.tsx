"use client";

import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  Upload,
  Loader2,
  CheckCircle2,
  FileText,
  X,
  Briefcase,
  MapPin,
  ChevronDown,
  MessageCircle,
  Clock,
  Info,
  AlertCircle,
  UserPlus,
} from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { buttonClasses } from "@/components/ui/Button";
import { useApiQuery } from "@/lib/hooks/use-api";
import { trackEvent } from "@/lib/analytics/PostHogProvider";
import { MAX_STANDARD_UPLOAD_BYTES } from "@/lib/constants/upload-limits";

interface OrgJob {
  id: string;
  title: string;
  location: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
}

interface PublicScreeningQuestion {
  id: string;
  questionText: string;
  sortOrder: number;
  answerType?: "yes_no" | "single_select";
  options?: string[] | null;
}

interface OrgData {
  organisation: { id: string; name: string; slug: string };
  jobs: OrgJob[];
  screeningQuestions: PublicScreeningQuestion[];
  reapplyPolicy?: { coolingOffDays: number; active: boolean };
}

function formatSalary(val: number): string {
  return `₹${(val / 100000).toFixed(0)}L`;
}

function getApplyUrl(slug: string, jobId?: string | null): string {
  if (typeof window !== "undefined") {
    const base = `${window.location.origin}/apply/${slug}`;
    return jobId ? `${base}?job=${jobId}` : base;
  }
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://tigerhire.io";
  const base = `${baseUrl}/apply/${slug}`;
  return jobId ? `${base}?job=${jobId}` : base;
}

function getWhatsAppShareUrl(applyUrl: string, orgName?: string): string {
  const message = orgName
    ? `Apply to open roles at ${orgName}:\n${applyUrl}`
    : `Apply here:\n${applyUrl}`;
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

type SubmitState = "idle" | "processing" | "success" | "error";

/** Mirrors `PublicApplyOutcome` from POST /api/apply */
type ApplyApiStatus = "scored" | "processing" | "no_open_roles" | "manual_review" | "submitted";

interface ApplySuccessPayload {
  success?: boolean;
  candidateName: string | null;
  jobsScored: number;
  topScore: number | null;
  status?: ApplyApiStatus;
  parsingPending?: boolean;
  noOpenJobs?: boolean;
  scoringFailed?: boolean;
  claimToken?: string | null;
}

export default function PublicApplyPage() {
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const preselectedJobId = searchParams.get("job");
  const utmSource = searchParams.get("utm_source");
  const ref = searchParams.get("ref");
  const hasReferralToken = Boolean(ref?.trim());

  const [file, setFile] = useState<File | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>(preselectedJobId ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  /** P2: explicit consent before WhatsApp outreach (unchecked = no WA). */
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplySuccessPayload | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** "yes" | "no" per question for knockout UI */
  const [screening, setScreening] = useState<Record<string, string>>({});

  const {
    data,
    loading,
    error: fetchError,
  } = useApiQuery<OrgData>(slug ? `/api/apply/${encodeURIComponent(slug)}` : null, {
    job: selectedJobId || undefined,
  });

  useEffect(() => {
    if (preselectedJobId) setSelectedJobId((prev) => prev || preselectedJobId);
  }, [preselectedJobId]);

  useEffect(() => {
    if (data?.jobs.length === 1 && !selectedJobId) {
      setSelectedJobId(data.jobs[0].id);
    }
  }, [data, selectedJobId]);

  useEffect(() => {
    setScreening({});
  }, [selectedJobId]);

  const handleFile = useCallback((f: File | null) => {
    if (!f) return;
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ];
    if (!allowed.includes(f.type)) {
      setSubmitError("Please upload a PDF or Word document.");
      return;
    }
    if (f.size > MAX_STANDARD_UPLOAD_BYTES) {
      setSubmitError(`File too large. Maximum ${MAX_STANDARD_UPLOAD_BYTES / 1024 / 1024} MB.`);
      return;
    }
    setSubmitError(null);
    setFile(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      handleFile(e.dataTransfer.files[0] ?? null);
    },
    [handleFile],
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!file || !slug) return;

    setSubmitError(null);
    setSubmitState("processing");

    const screeningQs = data?.screeningQuestions ?? [];
    if (selectedJobId && screeningQs.length > 0) {
      for (const q of screeningQs) {
        const v = screening[q.id];
        const valid =
          q.answerType === "single_select"
            ? Boolean(v) && (q.options ?? []).includes(v)
            : v === "yes" || v === "no";
        if (!valid) {
          setSubmitError("Please answer all screening questions.");
          setSubmitState("error");
          return;
        }
      }
    }

    const formData = new FormData();
    formData.append("file", file);
    formData.append("slug", slug);
    if (selectedJobId) formData.append("jobId", selectedJobId);
    if (name.trim()) formData.append("name", name.trim());
    if (phone.trim()) formData.append("phone", phone.trim());
    if (phone.trim()) {
      formData.append("whatsappOptIn", whatsappOptIn ? "true" : "false");
    }
    if (email.trim()) formData.append("email", email.trim());
    if (utmSource) formData.append("source", utmSource);
    const refHidden = formEl.querySelector<HTMLInputElement>('input[name="ref"]');
    const refVal = refHidden?.value?.trim();
    if (refVal) formData.append("ref", refVal);
    if (selectedJobId && screeningQs.length > 0) {
      formData.append(
        "screeningAnswers",
        JSON.stringify(
          screeningQs.map((q) =>
            q.answerType === "single_select"
              ? { questionId: q.id, answerText: screening[q.id] }
              : { questionId: q.id, answerYes: screening[q.id] === "yes" },
          ),
        ),
      );
    }

    try {
      const res = await fetch("/api/apply", {
        method: "POST",
        body: formData,
      });

      const json = (await res.json()) as ApplySuccessPayload & {
        error?: string;
        code?: string;
        retryAfter?: string;
        retryAfterIso?: string;
      };

      if (!res.ok) {
        let msg = json.error ?? "Something went wrong.";
        const retryIso = json.retryAfter ?? json.retryAfterIso;
        if (retryIso) {
          const retry = new Date(retryIso);
          if (!Number.isNaN(retry.getTime())) {
            msg += ` You can try again after ${retry.toLocaleDateString("en-GB", { dateStyle: "medium" })}.`;
          }
        }
        setSubmitError(msg);
        setSubmitState("error");
        return;
      }

      setResult({
        candidateName: json.candidateName ?? null,
        jobsScored: json.jobsScored ?? 0,
        topScore: json.topScore ?? null,
        status: json.status ?? "submitted",
        parsingPending: json.parsingPending,
        noOpenJobs: json.noOpenJobs,
        scoringFailed: json.scoringFailed,
        claimToken: json.claimToken ?? null,
      });
      setSubmitState("success");
      trackEvent("public_apply_submitted", {
        orgSlug: String(slug),
        jobId: selectedJobId || null,
        status: json.status ?? "submitted",
        jobsScored: json.jobsScored ?? 0,
        hasReferral: hasReferralToken,
      });
    } catch {
      setSubmitError("Network error. Please check your connection and try again.");
      setSubmitState("error");
    }
  }

  // Loading state
  if (loading) {
    return (
      <Shell>
        <div className="flex justify-center py-24">
          <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        </div>
      </Shell>
    );
  }

  // Org not found
  if (fetchError || !data?.organisation) {
    return (
      <Shell>
        <div className="py-24 text-center">
          <h1 className="text-xl font-semibold text-[var(--text)]">Company not found</h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            This link may be invalid or the company is no longer active.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black hover:bg-[var(--accent-hover)]"
          >
            Go to TigerHire
          </Link>
        </div>
      </Shell>
    );
  }

  const org = data.organisation;
  const jobs = data.jobs;
  const selectedJob = jobs.find((j) => j.id === selectedJobId);

  // Success state
  if (submitState === "success" && result) {
    const outcome: ApplyApiStatus =
      result.status ??
      (result.parsingPending
        ? "processing"
        : result.noOpenJobs
          ? "no_open_roles"
          : result.scoringFailed
            ? "manual_review"
            : result.jobsScored > 0
              ? "scored"
              : "submitted");

    const statusVisual =
      outcome === "scored"
        ? {
            wrap: "bg-emerald-500/10",
            Icon: CheckCircle2,
            iconClass: "text-emerald-400",
          }
        : outcome === "processing"
          ? {
              wrap: "bg-amber-500/10",
              Icon: Clock,
              iconClass: "text-amber-400",
            }
          : outcome === "manual_review"
            ? {
                wrap: "bg-amber-500/10",
                Icon: AlertCircle,
                iconClass: "text-amber-400",
              }
            : {
                wrap: "bg-sky-500/10",
                Icon: Info,
                iconClass: "text-sky-400",
              };

    const StatusIcon = statusVisual.Icon;

    return (
      <Shell orgName={org.name}>
        <div className="mx-auto max-w-4xl py-16 text-center">
          <div
            className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${statusVisual.wrap}`}
          >
            <StatusIcon size={36} className={statusVisual.iconClass} aria-hidden />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text)]">Application received</h1>
          <div
            className="mt-4 space-y-3 text-left rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 px-4 py-3 text-sm leading-relaxed text-[var(--text-muted)]"
            role="status"
            aria-live="polite"
          >
            <p className="font-medium text-[var(--text)]">
              {outcome === "scored" && "Status: Matched to open roles"}
              {outcome === "processing" && "Status: Saved — analysis finishing"}
              {outcome === "no_open_roles" && "Status: Saved — no open roles to auto-match"}
              {outcome === "manual_review" && "Status: Saved — recruiter review"}
              {outcome === "submitted" && "Status: Received"}
            </p>
            <p>
              {result.candidateName ? (
                <>
                  Thanks,{" "}
                  <span className="font-medium text-[var(--text)]">{result.candidateName}</span>
                  .{" "}
                </>
              ) : null}
              Your CV was delivered to{" "}
              <span className="font-medium text-[var(--text)]">{org.name}</span>.
            </p>
            {hasReferralToken && (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5 text-xs leading-relaxed text-emerald-200/95">
                <span className="font-medium text-emerald-100">Referral link used.</span> When the
                link is valid, the person who shared this role with you is credited for your
                application in {org.name}&apos;s referral programme.
              </p>
            )}
            {outcome === "scored" && result.jobsScored > 0 && (
              <p>
                We compared your profile to{" "}
                {result.jobsScored === 1
                  ? "the open role you targeted."
                  : `${result.jobsScored} open roles.`}
              </p>
            )}
            {outcome === "processing" && (
              <p>
                Your file uploaded successfully. We&apos;re still extracting and analysing your
                CV—this often takes under a minute. You don&apos;t need to submit again.
              </p>
            )}
            {outcome === "no_open_roles" && (
              <p>
                There aren&apos;t open roles listed for automatic matching right now. The company
                can still keep your CV on file and contact you if a fit opens up.
              </p>
            )}
            {outcome === "manual_review" && (
              <p>
                We stored your CV, but an automatic match score wasn&apos;t available (for example,
                unusual formatting or a temporary processing issue). The hiring team can still
                review your application normally.
              </p>
            )}
            {outcome === "submitted" && (
              <p>
                Your application is on file. The hiring team may follow up by email or phone if you
                shared contact details.
              </p>
            )}
          </div>
          {outcome === "scored" && result.topScore !== null && result.topScore >= 60 && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400">
              <CheckCircle2 size={16} aria-hidden />
              Strong match signal — the recruiter may prioritise your profile
            </div>
          )}
          {result.claimToken || email.trim() ? (
            <div className="mt-8 flex flex-col items-center gap-2">
              <a
                href={
                  result.claimToken
                    ? `/claim/${result.claimToken}`
                    : `/register?userType=candidate&email=${encodeURIComponent(email.trim())}`
                }
                className={buttonClasses("primary", "md")}
              >
                Create your free account &amp; finish your profile
              </a>
              <p className="text-xs text-[var(--text-subtle)]">
                We&apos;ll link this application to your account automatically.
              </p>
            </div>
          ) : (
            <p className="mt-8 text-xs text-[var(--text-subtle)]">
              Tip: add an email next time so{" "}
              <span className="font-medium text-[var(--text-muted)]">{org.name}</span> can reach you
              — and so you can create an account to track this application.
            </p>
          )}
          <a
            href={getWhatsAppShareUrl(getApplyUrl(slug!, null), org.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/60 px-5 py-2.5 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            <MessageCircle size={18} className="shrink-0 text-[#25D366]" aria-hidden />
            Share apply link via WhatsApp
          </a>
        </div>
      </Shell>
    );
  }

  // Main form
  return (
    <Shell orgName={org.name}>
      <div className="mx-auto max-w-4xl py-8 md:py-12">
        <div className="mb-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
            {org.name}
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--text)] md:text-3xl">
            Submit your CV
          </h1>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Drop your CV and we&apos;ll match you to{" "}
            {jobs.length === 1 ? "the open role" : `${jobs.length} open roles`} as scoring
            completes.
          </p>
        </div>

        {hasReferralToken && (
          <div className="mb-6 flex gap-3 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/[0.08] px-4 py-3 text-left">
            <UserPlus className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden />
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                You&apos;re applying through a referral link
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                {org.name} can attribute this application to whoever shared this link with you when
                the link is valid. If you&apos;re the referrer opening your own link to try the
                flow, you&apos;ll see the same candidate view.
              </p>
            </div>
          </div>
        )}

        {data.reapplyPolicy?.active && data.reapplyPolicy.coolingOffDays > 0 && (
          <div className="mb-6 flex gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 px-4 py-3 text-left">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--text-subtle)]" aria-hidden />
            <p className="text-xs leading-relaxed text-[var(--text-muted)]">
              <span className="font-medium text-[var(--text)]">Re-apply window.</span> If you
              recently withdrew or were not selected for a role at {org.name}, the system may ask
              you to wait up to {data.reapplyPolicy.coolingOffDays} days before a new application to
              the same company &mdash; you&apos;ll see a clear message with the earliest date.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <input type="hidden" name="ref" value={ref ?? ""} />
          {/* Job selector (if multiple jobs) */}
          {jobs.length > 1 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                Applying for
              </label>
              <div className="relative">
                <select
                  aria-label="Select a role to apply for"
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full appearance-none rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)] px-4 py-3 pr-10 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                >
                  <option value="">All open roles</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title}
                      {j.location ? ` — ${j.location}` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={16}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                />
              </div>
            </div>
          )}

          {/* Selected job card */}
          {selectedJob && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 p-4">
              <div className="flex items-start gap-3">
                <Briefcase size={18} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--text)]">{selectedJob.title}</p>
                  {selectedJob.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-muted)]">
                      <MapPin size={12} />
                      {selectedJob.location}
                    </p>
                  )}
                  {(selectedJob.compensation_min || selectedJob.compensation_max) && (
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {selectedJob.compensation_min
                        ? formatSalary(selectedJob.compensation_min)
                        : "?"}{" "}
                      –{" "}
                      {selectedJob.compensation_max
                        ? formatSalary(selectedJob.compensation_max)
                        : "?"}{" "}
                      / year
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {Boolean(selectedJobId) && (data?.screeningQuestions?.length ?? 0) > 0 && (
            <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-4">
              <p className="text-xs font-medium text-[var(--text-muted)]">
                Role requirements (yes / no)
              </p>
              <p className="text-xs text-[var(--text-subtle)]">
                Please answer each question. Your application is only added to the pipeline if you
                meet the minimum bar for this role. If you do not pass screening, you may not be
                told which specific answers were not a match.
              </p>
              <ul className="space-y-3">
                {(data?.screeningQuestions ?? [])
                  .toSorted((a, b) => a.sortOrder - b.sortOrder)
                  .map((q) => (
                    <li key={q.id} className="text-sm text-[var(--text)]">
                      <p className="font-medium leading-snug">{q.questionText}</p>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {q.answerType === "single_select" ? (
                          (q.options ?? []).map((opt) => (
                            <label
                              key={opt}
                              className="inline-flex cursor-pointer items-center gap-1.5 text-xs"
                            >
                              <input
                                type="radio"
                                name={`screen-${q.id}`}
                                className="border-[var(--border-interactive)]"
                                checked={screening[q.id] === opt}
                                onChange={() => setScreening((s) => ({ ...s, [q.id]: opt }))}
                              />
                              {opt}
                            </label>
                          ))
                        ) : (
                          <>
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                              <input
                                type="radio"
                                name={`screen-${q.id}`}
                                className="border-[var(--border-interactive)]"
                                checked={screening[q.id] === "yes"}
                                onChange={() => setScreening((s) => ({ ...s, [q.id]: "yes" }))}
                              />
                              Yes
                            </label>
                            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs">
                              <input
                                type="radio"
                                name={`screen-${q.id}`}
                                className="border-[var(--border-interactive)]"
                                checked={screening[q.id] === "no"}
                                onChange={() => setScreening((s) => ({ ...s, [q.id]: "no" }))}
                              />
                              No
                            </label>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {/* CV upload */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
              CV <span className="text-red-400">*</span>
            </label>
            {file ? (
              <div className="flex items-center gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 px-4 py-3">
                <FileText size={20} className="shrink-0 text-[var(--accent)]" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">{file.name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {(file.size / 1024).toFixed(0)} KB
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Remove file"
                  onClick={() => {
                    setFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
                >
                  <X size={16} />
                </button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                }}
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                  dragOver
                    ? "border-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-[var(--border)] bg-[var(--surface)]/40 hover:border-[var(--text-muted)]"
                }`}
              >
                <Upload size={28} className="text-[var(--text-muted)]" />
                <p className="text-sm font-medium text-[var(--text)]">
                  Drop your CV here or tap to upload
                </p>
                <p className="text-xs text-[var(--text-subtle)]">PDF or Word, up to 10 MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx"
              className="hidden"
              aria-label="Upload CV"
              onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {/* Optional contact info */}
          <div className="space-y-3">
            <p className="text-xs font-medium text-[var(--text-subtle)]">
              Optional — helps the recruiter reach you faster
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
              <input
                type="tel"
                placeholder="Phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
              />
            </div>
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--accent)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            />
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--border-interactive)] bg-[var(--surface)]/50 px-4 py-3 text-sm text-[var(--text-muted)]">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-[var(--border-interactive)] text-[var(--accent)]"
                checked={whatsappOptIn}
                onChange={(e) => setWhatsappOptIn(e.target.checked)}
                disabled={!phone.trim()}
                aria-disabled={!phone.trim()}
              />
              <span>
                Message me on WhatsApp about this application
                {!phone.trim() ? (
                  <span className="ml-1 text-xs text-[var(--text-subtle)]">(add phone first)</span>
                ) : null}
              </span>
            </label>
          </div>

          {/* Error */}
          {(submitError || submitState === "error") && (
            <div className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {submitError ?? "Something went wrong. Please try again."}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!file || submitState === "processing"}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 py-3.5 text-sm font-semibold text-black shadow-sm transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_20px_var(--glow)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitState === "processing" ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Submitting your application…
              </>
            ) : (
              <>
                <Upload size={18} />
                Submit CV
              </>
            )}
          </button>

          {/* Share apply link via WhatsApp — across all application routes */}
          <a
            href={getWhatsAppShareUrl(getApplyUrl(slug!, selectedJobId || null), org.name)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-6 py-3 text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            <MessageCircle size={18} className="shrink-0 text-[#25D366]" aria-hidden />
            Send apply link via WhatsApp
          </a>
        </form>

        <p className="mt-8 text-center text-xs leading-relaxed text-[var(--text-subtle)]">
          Your CV is processed securely by{" "}
          <Link href="/" className="font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
            TigerHire
          </Link>
          . We&apos;ll parse your skills and experience to match you with the right roles. No
          account required.
        </p>
      </div>
    </Shell>
  );
}

function Shell({ children, orgName }: { children: React.ReactNode; orgName?: string }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-6">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
          {orgName && (
            <span className="text-sm font-medium text-[var(--text-muted)]">{orgName}</span>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 md:px-6">{children}</main>
    </div>
  );
}
