"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { CalendarClock, ClipboardList, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { useApiQuery } from "@/lib/hooks/use-api";
import { StatusBadge } from "@/components/ui/StatusBadge";
import FitRing from "@/components/ui/FitRing";
import { getPrepPriorityTone } from "@/lib/status-tones";
import { useAuth } from "@/lib/auth/AuthProvider";
import type {
  InterviewPrepResponse,
  InterviewPrepTemplateLibraryResponse,
  PrepPack,
  PrepPackTemplate,
  PrepQueueItem,
} from "@/lib/interview-prep/types";

interface InterviewPrepPageProps {
  routeBasePath?: "/company" | "/recruit";
}

interface PrepTemplateDraft {
  title: string;
  roleFunction: string;
  stageName: string;
  whenToUse: string;
  objective: string;
  questionTracks: string;
  rubric: string;
}

interface ExecutionAction {
  href: string;
  label: string;
  description: string;
}

const EMPTY_TEMPLATE_DRAFT: PrepTemplateDraft = {
  title: "",
  roleFunction: "",
  stageName: "",
  whenToUse: "",
  objective: "",
  questionTracks: "",
  rubric: "",
};

export default function RecruitInterviewPrepPage({ routeBasePath }: InterviewPrepPageProps = {}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const roleBasePath =
    routeBasePath ??
    (["leadership", "hiring_manager", "interviewer"].includes(user?.role ?? "")
      ? "/company"
      : "/recruit");
  const isInterviewer = user?.role === "interviewer";
  const [selectedPrepId, setSelectedPrepId] = useState<string | null>(null);
  const [jobFilterId, setJobFilterId] = useState<string | null>(null);
  const requestedPrepId = searchParams.get("pipelineCandidateId");
  const activePrepId = selectedPrepId ?? requestedPrepId ?? undefined;
  const { data, loading, error } = useApiQuery<InterviewPrepResponse>("/api/interview-prep", {
    ...(activePrepId ? { pipelineCandidateId: activePrepId } : {}),
    ...(jobFilterId ? { jobId: jobFilterId } : {}),
  });
  const {
    data: templateLibraryData,
    loading: templateLibraryLoading,
    error: templateLibraryError,
    refetch: refetchTemplateLibrary,
  } = useApiQuery<InterviewPrepTemplateLibraryResponse>("/api/interview-prep/templates");
  const [templateDraft, setTemplateDraft] = useState<PrepTemplateDraft>(EMPTY_TEMPLATE_DRAFT);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [archivingTemplateId, setArchivingTemplateId] = useState<string | null>(null);
  const [templateNotice, setTemplateNotice] = useState<string | null>(null);

  const queue = useMemo(() => data?.queue ?? [], [data]);
  const scopeRoles = data?.scope?.roles ?? [];
  const selectedPack = data?.selectedPack ?? null;
  const studioTemplates = data?.studioTemplates ?? [];
  const templateLibrary = useMemo(
    () => templateLibraryData?.templates ?? [],
    [templateLibraryData],
  );
  const canManageTemplates = templateLibraryData?.canManageTemplates === true;

  const pipelineHref =
    roleBasePath === "/company"
      ? user?.role === "leadership"
        ? "/recruit/pipeline?focus=tomorrow-plan"
        : "/company/my-pipeline?focus=tomorrow-plan"
      : "/recruit/pipeline?focus=tomorrow-plan";
  const assessmentHref = "/recruit/assessments?focus=submitted";
  const jobsHref = roleBasePath === "/company" ? "/company/jobs" : "/recruit/jobs";

  useEffect(() => {
    if (loading) return;
    const want = selectedPrepId ?? requestedPrepId ?? null;
    if (want && queue.some((item) => item.pipelineCandidateId === want)) return;
    if (queue.length > 0) {
      setSelectedPrepId(queue[0].pipelineCandidateId);
    } else {
      setSelectedPrepId(null);
    }
  }, [loading, queue, requestedPrepId, selectedPrepId]);

  const queueMetrics = useMemo(
    () => ({
      critical: queue.filter((item) => item.prepPriority === "critical").length,
      openAssessments: queue.reduce(
        (sum, item) => sum + item.pendingAssessments + item.submittedAssessments,
        0,
      ),
      noFeedbackYet: queue.filter((item) => item.feedbackCount === 0).length,
    }),
    [queue],
  );

  const savedTemplateLibrary = useMemo(
    () => templateLibrary.filter((template) => template.source === "saved"),
    [templateLibrary],
  );

  const executionActions = useMemo<ExecutionAction[]>(() => {
    if (isInterviewer) {
      return [
        {
          href: "/company/interviews",
          label: "Open interviewer queue",
          description: selectedPack
            ? "Return to your assigned interviews after reviewing the current prep pack."
            : "Check your assigned interviews while prep packs populate.",
        },
        {
          href: assessmentHref,
          label: "Open assessment review queue",
          description:
            "Score open submissions before the interview if they should inform the round.",
        },
        {
          href: pipelineHref,
          label: "Open tomorrow plan in pipeline",
          description: "Review the broader interview queue and schedule risk.",
        },
      ];
    }

    if (roleBasePath === "/recruit") {
      if (selectedPack) {
        return [
          {
            href: `/recruit/jobs/${selectedPack.job.id}/feedback`,
            label: "Open feedback workspace",
            description:
              "Open the scorecards and prior interview notes tied to this candidate and role.",
          },
          {
            href: assessmentHref,
            label: "Open assessment review queue",
            description:
              "Score open submissions before the interview if they should inform the round.",
          },
          {
            href: "/recruit",
            label: "Open recruiter dashboard",
            description: "Keep the recruiting command view nearby while you work this prep pack.",
          },
          {
            href: pipelineHref,
            label: "Open tomorrow plan in pipeline",
            description: "Review the broader interview queue and schedule risk.",
          },
        ];
      }

      return [
        {
          href: pipelineHref,
          label: "Open tomorrow plan in pipeline",
          description: "Review the broader interview queue and schedule risk.",
        },
        {
          href: assessmentHref,
          label: "Open assessment review queue",
          description:
            "Score open submissions before the interview if they should inform the round.",
        },
        {
          href: "/recruit",
          label: "Open recruiter dashboard",
          description: "Return to the recruiting overview while you wait for a prep pack.",
        },
      ];
    }

    if (selectedPack) {
      return [
        {
          href: `/company/jobs/${selectedPack.job.id}`,
          label: "Open role workspace",
          description: "Open the company job workspace tied to this interview.",
        },
        {
          href: assessmentHref,
          label: "Open assessment review queue",
          description:
            "Score open submissions before the interview if they should inform the round.",
        },
        {
          href: "/company/interviews",
          label: "Open interview schedule",
          description: "Keep the interview calendar nearby while you work this prep pack.",
        },
        {
          href: pipelineHref,
          label: "Open tomorrow plan in pipeline",
          description: "Review the broader interview queue and schedule risk.",
        },
      ];
    }

    return [
      {
        href: pipelineHref,
        label: "Open tomorrow plan in pipeline",
        description: "Review the broader interview queue and schedule risk.",
      },
      {
        href: assessmentHref,
        label: "Open assessment review queue",
        description: "Score open submissions before the interview if they should inform the round.",
      },
      {
        href: "/company/interviews",
        label: "Open interview schedule",
        description: "Check the calendar and assigned interviews while prep packs populate.",
      },
    ];
  }, [assessmentHref, isInterviewer, pipelineHref, roleBasePath, selectedPack]);

  function hydrateDraftFromTemplate(template: PrepPackTemplate) {
    setEditingTemplateId(template.id ?? null);
    setTemplateDraft({
      title: template.title,
      roleFunction: template.roleFunction ?? selectedPack?.job.roleFunction ?? "",
      stageName: template.stageName ?? selectedPack?.stage.name ?? "",
      whenToUse: template.whenToUse,
      objective: template.objective,
      questionTracks: template.questionTracks.join("\n"),
      rubric: template.rubric.join("\n"),
    });
    setTemplateNotice(null);
  }

  function seedDraftFromPack() {
    const preferredTemplate =
      studioTemplates.find((template) => template.source === "suggested") ??
      studioTemplates[0] ??
      null;
    setEditingTemplateId(null);
    setTemplateDraft({
      title: preferredTemplate?.title ?? `${selectedPack?.stage.name ?? "Interview"} prep track`,
      roleFunction: selectedPack?.job.roleFunction ?? "",
      stageName: selectedPack?.stage.name ?? "",
      whenToUse:
        preferredTemplate?.whenToUse ??
        "Use this prep kit when the team needs a structured interview track for the round.",
      objective: preferredTemplate?.objective ?? selectedPack?.stage.objective ?? "",
      questionTracks: preferredTemplate?.questionTracks.join("\n") ?? "",
      rubric: preferredTemplate?.rubric.join("\n") ?? "",
    });
    setTemplateNotice(null);
  }

  async function persistTemplate() {
    const questionTracks = templateDraft.questionTracks
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
    const rubric = templateDraft.rubric
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);

    if (
      !templateDraft.title.trim() ||
      !templateDraft.whenToUse.trim() ||
      !templateDraft.objective.trim()
    ) {
      setTemplateNotice("Title, when-to-use, and objective are required.");
      return;
    }
    if (questionTracks.length === 0 || rubric.length === 0) {
      setTemplateNotice("Add at least one question track and one rubric line.");
      return;
    }

    setSavingTemplate(true);
    setTemplateNotice(null);
    try {
      const method = editingTemplateId ? "PATCH" : "POST";
      const endpoint = editingTemplateId
        ? `/api/interview-prep/templates/${editingTemplateId}`
        : "/api/interview-prep/templates";
      const response = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: templateDraft.title.trim(),
          roleFunction: templateDraft.roleFunction.trim() || null,
          stageName: templateDraft.stageName.trim() || null,
          whenToUse: templateDraft.whenToUse.trim(),
          objective: templateDraft.objective.trim(),
          questionTracks,
          rubric,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setTemplateNotice(payload.error || "Failed to save prep template.");
        return;
      }
      setTemplateNotice(editingTemplateId ? "Prep template updated." : "Prep template created.");
      setTemplateDraft(EMPTY_TEMPLATE_DRAFT);
      setEditingTemplateId(null);
      await refetchTemplateLibrary();
    } finally {
      setSavingTemplate(false);
    }
  }

  async function archiveTemplate(templateId: string) {
    setArchivingTemplateId(templateId);
    setTemplateNotice(null);
    try {
      const response = await fetch(`/api/interview-prep/templates/${templateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setTemplateNotice(payload.error || "Failed to archive prep template.");
        return;
      }
      if (editingTemplateId === templateId) {
        setTemplateDraft(EMPTY_TEMPLATE_DRAFT);
        setEditingTemplateId(null);
      }
      setTemplateNotice("Prep template archived.");
      await refetchTemplateLibrary();
    } finally {
      setArchivingTemplateId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Interview Prep"
        subtitle="Prepare each interview with role context, candidate signal, and clear next-step handoffs."
      />
      <div className="space-y-4">
        {loading ? <p className="text-sm text-white/65">Loading prep workspace...</p> : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {templateLibraryData?.warning ? (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            {templateLibraryData.warning}
          </p>
        ) : null}
        {templateLibraryError ? (
          <p className="text-sm text-red-300">{templateLibraryError}</p>
        ) : null}
        {templateNotice ? (
          <p className="card-lifted px-3 py-2 text-xs text-white/65">{templateNotice}</p>
        ) : null}

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Prep queue"
            value={queue.length}
            hint="Upcoming interviews currently ready for preparation."
            tone="accent"
          />
          <MetricCard
            label="Critical prep"
            value={queueMetrics.critical}
            hint="Upcoming interviews with unresolved risk or open evidence."
            tone={queueMetrics.critical > 0 ? "warning" : "default"}
          />
          <MetricCard
            label="Open assessment signal"
            value={queueMetrics.openAssessments}
            hint="Pending or submitted assessments linked to the prep queue."
          />
          <MetricCard
            label="No prior feedback"
            value={queueMetrics.noFeedbackYet}
            hint="Queue items where this round may generate the first formal signal."
            tone="success"
          />
        </section>

        <section className="card-lifted p-4">
          <SectionHeader
            eyebrow="Prep queue"
            title="Choose the interview you are preparing for"
            description="This queue is prioritized using upcoming schedule, FitScore risk, open assessments, and prior feedback coverage."
          />

          {isInterviewer ? (
            <p className="mt-3 max-w-3xl text-xs text-white/55">
              Your list is scoped to stages where your account email is set as the interviewer. Each
              row must have a{" "}
              <span className="text-white/70">scheduled interview time in the future</span> to
              appear here.
            </p>
          ) : (
            <p className="mt-3 max-w-3xl text-xs text-white/55">
              Only candidates with a future interview on the calendar (and no outcome logged yet)
              appear here. Use{" "}
              <Link
                className="text-[var(--accent)] underline-offset-2 hover:underline"
                href={jobsHref}
              >
                jobs
              </Link>{" "}
              and the pipeline to schedule interviews and assign interviewers.
            </p>
          )}

          {scopeRoles.length > 1 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <label htmlFor="interview-prep-role-filter" className="text-xs text-white/55">
                {isInterviewer ? "Assigned role" : "Role"}
              </label>
              <select
                id="interview-prep-role-filter"
                value={jobFilterId ?? ""}
                onChange={(event) => {
                  const next = event.target.value;
                  setJobFilterId(next === "" ? null : next);
                }}
                className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
              >
                <option value="">All roles ({scopeRoles.length})</option>
                {scopeRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.title}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {queue.length === 0 && !loading ? (
            <div className="mt-4 space-y-3 text-xs text-white/60">
              <p>No upcoming interviews are in the prep queue for this view.</p>
              {jobFilterId ? (
                <p className="text-amber-200/90">
                  No interviews match the selected role. Choose &quot;All roles&quot; or confirm
                  this role has future-dated interviews.
                </p>
              ) : null}
              <ul className="list-inside list-disc space-y-1">
                <li>
                  Schedule a date/time on the candidate&apos;s pipeline card (or from your
                  interviews calendar).
                </li>
                <li>
                  <Link
                    href={pipelineHref}
                    className="text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Open pipeline
                  </Link>{" "}
                  ·{" "}
                  <Link
                    href={jobsHref}
                    className="text-[var(--accent)] underline-offset-2 hover:underline"
                  >
                    Open jobs
                  </Link>
                </li>
              </ul>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {queue.map((item) => (
                <button
                  key={item.pipelineCandidateId}
                  type="button"
                  onClick={() => setSelectedPrepId(item.pipelineCandidateId)}
                  className={`rounded-xl border p-4 text-left transition ${
                    selectedPack?.queueItem.pipelineCandidateId === item.pipelineCandidateId
                      ? "border-white/15 bg-white/[0.05]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] hover:border-white/20 hover:bg-white/[0.04]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {item.candidateName}
                      </p>
                      <p className="text-xs text-white/65">
                        {item.jobTitle} - {item.stageName}
                      </p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-white/65">
                        <CalendarClock size={12} />
                        {new Date(item.scheduledAt).toLocaleString()}
                      </p>
                    </div>
                    <PriorityBadge priority={item.prepPriority} />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <QueueStat label="FitScore" value={formatScore(item.overallScore)} />
                    <QueueStat
                      label="Assessments open"
                      value={`${item.pendingAssessments + item.submittedAssessments}`}
                    />
                    <QueueStat label="Feedback" value={`${item.feedbackCount}`} />
                  </div>
                  <p className="mt-3 text-xs text-white/65">
                    {item.summary ??
                      "No summary yet. Use this round to establish the strongest signal."}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
          <div className="card-lifted p-4">
            <SectionHeader
              eyebrow="Prep context"
              title={
                selectedPack
                  ? `${selectedPack.candidate.name} - ${selectedPack.job.title}`
                  : "Select an interview from the prep queue"
              }
              description={
                selectedPack
                  ? "This pack is generated from live pipeline, FitScore, assessment, and feedback data already in TigerHire."
                  : "Choose a queue item to load the candidate- and role-specific prep pack."
              }
            />

            {selectedPack ? <PrepPackDetails pack={selectedPack} /> : null}
          </div>

          <aside className="space-y-4">
            <div className="card-lifted p-4">
              <SectionHeader
                eyebrow="Execution handoff"
                title="Move from prep to action"
                description="Use the strongest next action based on the current prep pack."
              />
              <div className="mt-4 space-y-3">
                {executionActions.map((action) => (
                  <ActionLink
                    key={`${action.label}-${action.href}`}
                    href={action.href}
                    label={action.label}
                    description={action.description}
                  />
                ))}
              </div>
            </div>

            <div className="card-lifted p-4">
              <SectionHeader
                eyebrow="Prep studio"
                title="Relevant interview tracks"
                description="Saved templates appear first, followed by suggested tracks generated from the live prep pack."
              />
              <div className="mt-4 space-y-3">
                {studioTemplates.length === 0 ? (
                  <p className="text-xs text-white/60">
                    Select a queue item to load stage-aware prep tracks.
                  </p>
                ) : (
                  studioTemplates.map((template) => (
                    <PrepTemplateCard key={template.key} template={template} />
                  ))
                )}
              </div>
            </div>

            <div className="card-lifted p-4">
              <SectionHeader
                eyebrow="Saved studio"
                title="Persist reusable prep templates"
                description="Store stage- and role-aware kits so future interviews start from real templates, not only generated suggestions."
              />
              <div className="mt-4 space-y-3">
                <button
                  type="button"
                  onClick={seedDraftFromPack}
                  disabled={!selectedPack}
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
                >
                  Use current prep pack as template draft
                </button>

                {canManageTemplates ? (
                  <div className="space-y-2 card-lifted p-3">
                    <input
                      type="text"
                      placeholder="Template title"
                      value={templateDraft.title}
                      onChange={(event) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          title: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                    />
                    <div className="grid gap-2 md:grid-cols-2">
                      <input
                        type="text"
                        placeholder="Role function (optional)"
                        value={templateDraft.roleFunction}
                        onChange={(event) =>
                          setTemplateDraft((prev) => ({
                            ...prev,
                            roleFunction: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                      />
                      <input
                        type="text"
                        placeholder="Stage name (optional)"
                        value={templateDraft.stageName}
                        onChange={(event) =>
                          setTemplateDraft((prev) => ({
                            ...prev,
                            stageName: event.target.value,
                          }))
                        }
                        className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                      />
                    </div>
                    <textarea
                      rows={2}
                      placeholder="When should this template be used?"
                      value={templateDraft.whenToUse}
                      onChange={(event) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          whenToUse: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                    />
                    <textarea
                      rows={3}
                      placeholder="Template objective"
                      value={templateDraft.objective}
                      onChange={(event) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          objective: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                    />
                    <textarea
                      rows={4}
                      placeholder="Question tracks (one per line)"
                      value={templateDraft.questionTracks}
                      onChange={(event) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          questionTracks: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                    />
                    <textarea
                      rows={3}
                      placeholder="Rubric lines (one per line)"
                      value={templateDraft.rubric}
                      onChange={(event) =>
                        setTemplateDraft((prev) => ({
                          ...prev,
                          rubric: event.target.value,
                        }))
                      }
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2 text-xs text-[var(--text)]"
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={persistTemplate}
                        disabled={savingTemplate}
                        className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
                      >
                        {savingTemplate
                          ? "Saving..."
                          : editingTemplateId
                            ? "Save template"
                            : "Create template"}
                      </button>
                      {editingTemplateId ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingTemplateId(null);
                            setTemplateDraft(EMPTY_TEMPLATE_DRAFT);
                            setTemplateNotice(null);
                          }}
                          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs text-white/65"
                        >
                          Cancel edit
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-white/60">
                    This role can view prep templates, but only recruiter/company-admin style roles
                    can manage them.
                  </p>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                    Saved template library
                  </p>
                  {templateLibraryLoading ? (
                    <p className="text-xs text-white/60">Loading saved prep templates...</p>
                  ) : savedTemplateLibrary.length === 0 ? (
                    <p className="text-xs text-white/60">No saved prep templates yet.</p>
                  ) : (
                    savedTemplateLibrary.map((template) => (
                      <div key={template.key} className="card-lifted p-3">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-[var(--text)]">
                              {template.title}
                            </p>
                            <p className="mt-1 text-[11px] text-white/60">
                              {template.roleFunction ?? "All roles"} -{" "}
                              {template.stageName ?? "All stages"}
                            </p>
                          </div>
                          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-white/65">
                            saved
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-white/60">{template.whenToUse}</p>
                        {canManageTemplates ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => hydrateDraftFromTemplate(template)}
                              className="rounded-md border border-[var(--border)] px-3 py-1 text-xs text-[var(--text)]"
                            >
                              Edit
                            </button>
                            {template.id ? (
                              <button
                                type="button"
                                disabled={archivingTemplateId === template.id}
                                onClick={() => archiveTemplate(template.id!)}
                                className="rounded-full border border-red-500/40 px-3 py-1 text-xs text-red-300 disabled:opacity-50"
                              >
                                {archivingTemplateId === template.id ? "Archiving..." : "Archive"}
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </>
  );
}

function PrepPackDetails({ pack }: { pack: PrepPack }) {
  const recommendationEntries = Object.entries(pack.feedback.recommendationBreakdown);

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <QueueStat label="FitScore" value={formatScore(pack.fitScore.overallScore)} />
        <QueueStat label="Band" value={pack.fitScore.band ?? "No band"} />
        <QueueStat label="Confidence" value={pack.fitScore.confidence ?? "Not set"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoPanel
          title="Round brief"
          icon={<ClipboardList size={16} className="text-[var(--accent)]" />}
          lines={[
            `Stage: ${pack.stage.name}`,
            `Objective: ${pack.stage.objective}`,
            `Scheduled: ${new Date(pack.stage.scheduledAt).toLocaleString()}`,
          ]}
        />
        <InfoPanel
          title="Candidate profile"
          icon={<Sparkles size={16} className="text-[var(--accent)]" />}
          lines={[
            `Current role: ${pack.candidate.currentRole ?? "Not captured"}`,
            `Experience: ${pack.candidate.experienceYears != null ? `${pack.candidate.experienceYears} years` : "Not captured"}`,
            `Location: ${pack.candidate.location ?? "Not captured"}`,
            pack.candidate.skills.length > 0
              ? `Skills: ${pack.candidate.skills.slice(0, 5).join(", ")}`
              : "Skills not captured yet",
          ]}
        />
      </div>

      <div className="card-lifted p-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">Signal snapshot</h3>
        <p className="mt-2 text-xs text-white/60">
          {pack.fitScore.summary ??
            "No FitScore summary is available yet for this candidate/job pair."}
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <SignalList
            title="Strengths"
            items={pack.fitScore.strengths}
            emptyLabel="No strengths captured yet."
          />
          <SignalList
            title="Green flags"
            items={pack.fitScore.greenFlags}
            emptyLabel="No green flags captured yet."
          />
          <SignalList
            title="Red flags"
            items={pack.fitScore.redFlags}
            emptyLabel="No red flags captured yet."
          />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card-lifted p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Assessment signal</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <QueueStat label="Pending" value={`${pack.assessments.pendingCount}`} />
            <QueueStat label="Submitted" value={`${pack.assessments.submittedCount}`} />
            <QueueStat label="Scored" value={`${pack.assessments.scoredCount}`} />
          </div>
          <div className="mt-3 space-y-2">
            {pack.assessments.recent.length === 0 ? (
              <p className="text-xs text-white/60">No linked assessments yet.</p>
            ) : (
              pack.assessments.recent.map((assessment) => (
                <div
                  key={assessment.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3"
                >
                  <p className="text-xs font-semibold text-[var(--text)]">{assessment.title}</p>
                  <p className="mt-1 text-[11px] text-white/60">
                    {assessment.type} - {assessment.status} - due{" "}
                    {new Date(assessment.deadlineAt).toLocaleString()}
                  </p>
                  {assessment.score != null && assessment.maxScore != null ? (
                    <div className="mt-1 flex items-center gap-2">
                      <FitRing
                        score={Math.min(
                          100,
                          Math.max(0, Math.round((assessment.score / assessment.maxScore) * 100)),
                        )}
                        size={22}
                      />
                      <p className="text-[11px] text-emerald-300">
                        <span className="tabular-nums">{assessment.score}</span>/
                        <span className="tabular-nums">{assessment.maxScore}</span>
                      </p>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card-lifted p-4">
          <h3 className="text-sm font-semibold text-[var(--text)]">Prior feedback signal</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <QueueStat label="Entries" value={`${pack.feedback.count}`} />
            <QueueStat
              label="Avg rating"
              value={pack.feedback.avgRating != null ? `${pack.feedback.avgRating}/5` : "No rating"}
            />
            <QueueStat
              label="Latest rec"
              value={labelForRecommendation(pack.feedback.latestRecommendation)}
            />
          </div>
          {recommendationEntries.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {recommendationEntries.map(([key, value]) => (
                <span
                  key={key}
                  className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-white/60"
                >
                  {labelForRecommendation(key)}: {value}
                </span>
              ))}
            </div>
          ) : null}
          <div className="mt-3 space-y-2">
            {pack.feedback.latestNotes.length === 0 ? (
              <p className="text-xs text-white/60">
                No prior written notes yet. This round may generate the first structured evidence.
              </p>
            ) : (
              pack.feedback.latestNotes.map((note) => (
                <div
                  key={note}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3"
                >
                  <p className="text-xs text-white/60">{note}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card-lifted p-4">
        <h3 className="text-sm font-semibold text-[var(--text)]">What to validate in this round</h3>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {pack.prepSections.map((section) => (
            <div
              key={section.title}
              className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/50 p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
                {section.title}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-white/60">
                {section.points.map((point) => (
                  <li key={point}>- {point}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">{title}</h2>
      <p className="mt-1 max-w-3xl text-xs text-white/65">{description}</p>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "default" | "accent" | "success" | "warning";
}) {
  const toneClass =
    tone === "accent"
      ? "border-[var(--accent)]/30 bg-[var(--accent)]/10"
      : tone === "success"
        ? "border-emerald-500/20 bg-emerald-500/10"
        : tone === "warning"
          ? "border-amber-500/25 bg-amber-500/10"
          : "border-[var(--border)] bg-[var(--bg-elevated)]";

  return (
    <div className={`card-lifted rounded-xl p-4 ${toneClass}`}>
      <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-[var(--text)]">{value}</p>
      <p className="mt-1 text-xs text-white/65">{hint}</p>
    </div>
  );
}

function QueueStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 px-3 py-2">
      <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">{value}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: PrepQueueItem["prepPriority"] }) {
  return (
    <StatusBadge tone={getPrepPriorityTone(priority)} size="sm" className="uppercase">
      {priority}
    </StatusBadge>
  );
}

function SignalList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: string[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface)]/50 p-3">
      <p className="text-xs font-semibold text-[var(--text)]">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-white/65">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 space-y-1 text-xs text-white/65">
          {items.slice(0, 4).map((item) => (
            <li key={item}>- {item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InfoPanel({
  title,
  icon,
  lines,
}: {
  title: string;
  icon: React.ReactNode;
  lines: string[];
}) {
  return (
    <div className="card-lifted rounded-xl p-4">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
      </div>
      <div className="mt-3 space-y-2">
        {lines.map((line) => (
          <p key={line} className="text-xs text-white/65">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function PrepTemplateCard({ template }: { template: PrepPackTemplate }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
          {template.title}
        </p>
        <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-white/65">
          {template.source}
        </span>
      </div>
      <p className="mt-2 text-xs text-white/65">{template.whenToUse}</p>
      {template.roleFunction || template.stageName ? (
        <p className="mt-2 text-[11px] text-white/45">
          {template.roleFunction ?? "All roles"} - {template.stageName ?? "All stages"}
        </p>
      ) : null}
      <p className="mt-2 text-xs font-medium text-[var(--text)]">Objective</p>
      <p className="mt-1 text-xs text-white/65">{template.objective}</p>
      <p className="mt-3 text-xs font-medium text-[var(--text)]">Question tracks</p>
      <ul className="mt-1 space-y-1 text-xs text-white/65">
        {template.questionTracks.map((track) => (
          <li key={track}>- {track}</li>
        ))}
      </ul>
      <p className="mt-3 text-xs font-medium text-[var(--text)]">Rubric</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {template.rubric.map((item) => (
          <span
            key={item}
            className="rounded-full border border-[var(--border)] px-2 py-1 text-[11px] text-white/65"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

function ActionLink({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-md border border-[var(--border)] bg-[var(--bg-elevated)] p-3 transition hover:border-white/20 hover:bg-white/[0.04]"
    >
      <p className="text-xs font-semibold text-[var(--text)]">{label}</p>
      <p className="mt-1 text-xs text-white/65">{description}</p>
    </Link>
  );
}

function formatScore(value: number | null): string {
  return value != null ? `${value}` : "No score";
}

function labelForRecommendation(value: string | null): string {
  if (!value) return "No recommendation";
  if (value === "strong_hire") return "Strong Hire";
  if (value === "strong_no_hire") return "Strong No Hire";
  return value.replace(/_/g, " ");
}
