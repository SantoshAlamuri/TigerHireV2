"use client";

import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useEffect,
  useMemo,
  useState,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AssessmentInstructionRichHtml,
  assessmentInstructionsVisibleTextApprox,
} from "@/components/dashboard/AssessmentInstructionRichHtml";
import {
  escapeInstructionPlainText,
  legacyInstructionTextToHtml,
} from "@/components/dashboard/AssessmentInstructionRichEditor";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  ASSESSMENT_EVALUATION_DUE_SOON_HOURS,
  ASSESSMENT_REVIEWER_ROLES,
  ASSESSMENT_TEMPLATE_LIBRARY,
  TEMPLATE_STUDIO_ROLES,
  builtInPackDisplayName,
  getAssessmentTypeLabel,
  type AssessmentBuilderType,
  type AssessmentShareChannel,
  type AssessmentScope,
  type AssessmentType,
} from "@/lib/assessments/constants";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";
import { CreateCenterSection } from "./components/AssessmentSections";

function escapeHrefAttribute(url: string): string {
  return url.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Only https URLs are persisted as links; junk lines are skipped. */
function attachmentLinesToAppendHtml(lines: string[]): string {
  const urls: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!/^https:\/\/.+/i.test(t)) continue;
    try {
      const parsed = new URL(t);
      if (parsed.protocol !== "https:") continue;
      urls.push(parsed.toString());
    } catch {
      // skip invalid
    }
  }
  if (urls.length === 0) return "";
  const items = urls
    .map((url) => {
      const h = escapeHrefAttribute(url);
      return `<li><a href="${h}">${escapeInstructionPlainText(url)}</a></li>`;
    })
    .join("");
  return `<hr /><p><strong>Attachments / references</strong></p><ul>${items}</ul>`;
}

interface AssessmentRow {
  id: string;
  application_id: string;
  title: string;
  type: AssessmentType;
  status: string;
  deadline_at: string;
  score: number | null;
  max_score: number | null;
  pass_threshold_pct: number | null;
  instructions: string | null;
}

type EvaluationFilter = "all" | "due_soon" | "overdue";

interface ApplicationOption {
  id: string;
  jobs: { title: string | null } | null;
  candidates: { name: string | null } | null;
}

interface ReviewerOption {
  id: string;
  full_name: string | null;
  role: string;
}

interface AssessmentTemplate {
  id: string;
  type: AssessmentRow["type"];
  scope: AssessmentScope;
  name: string;
  content: string;
  is_active?: boolean;
}

interface CreateAssessmentDraft {
  applicationId: string;
  title: string;
  type: AssessmentBuilderType;
  scope: AssessmentScope;
  templateKey: string;
  instructions: string;
  deadlineAt: string;
  reviewerId: string;
  passThresholdPct: string;
  autoAdvance: boolean;
  externalPlatform: string;
  attachmentLinks: string;
  shareEmail: boolean;
  shareWhatsapp: boolean;
  recipientEmail: string;
  recipientPhone: string;
}

interface TemplateDraft {
  type: AssessmentBuilderType;
  scope: AssessmentScope;
  name: string;
  content: string;
}

export function RecruitAssessmentsWorkspace({ jobId: scopedJobId }: { jobId?: string } = {}) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const prefillApplicationId = searchParams.get("applicationId");
  const prefillStageId = searchParams.get("stageId");
  const assessmentsListParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (scopedJobId) params.jobId = scopedJobId;
    if (prefillStageId) params.stageId = prefillStageId;
    if (prefillApplicationId) params.applicationId = prefillApplicationId;
    return Object.keys(params).length > 0 ? params : undefined;
  }, [scopedJobId, prefillStageId, prefillApplicationId]);

  const { data, loading, error, refetch } = useApiQuery<{ assessments: AssessmentRow[] }>(
    "/api/assessments",
    assessmentsListParams,
  );
  const applicationsQueryParams = useMemo(() => {
    const params: Record<string, string | number> = { limit: 100 };
    if (scopedJobId) params.jobId = scopedJobId;
    return params;
  }, [scopedJobId]);
  const { data: applicationsData } = useApiQuery<{ applications: ApplicationOption[] }>(
    "/api/applications",
    applicationsQueryParams,
  );
  const { data: reviewersData } = useApiQuery<{ members: ReviewerOption[] }>(
    "/api/organisations/members",
  );
  const {
    data: templatesData,
    loading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useApiQuery<{
    templates: AssessmentTemplate[];
    canManageTemplates: boolean;
    warning?: string;
  }>("/api/assessment-templates");
  const [scoreDraft, setScoreDraft] = useState<
    Record<string, { score: string; maxScore: string; feedback: string }>
  >({});
  const [createDraft, setCreateDraft] = useState<CreateAssessmentDraft>({
    applicationId: "",
    title: "",
    type: "written",
    scope: "screening",
    templateKey: "",
    instructions: "",
    deadlineAt: "",
    reviewerId: "",
    passThresholdPct: "60",
    autoAdvance: true,
    externalPlatform: "",
    attachmentLinks: "",
    shareEmail: true,
    shareWhatsapp: false,
    recipientEmail: "",
    recipientPhone: "",
  });
  const [creating, setCreating] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [installingBuiltInKey, setInstallingBuiltInKey] = useState<string | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateDraft>({
    type: "written",
    scope: "screening",
    name: "",
    content: "",
  });
  const [templateFilterType, setTemplateFilterType] = useState<AssessmentBuilderType | "all">(
    "all",
  );
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [editingTemplateName, setEditingTemplateName] = useState("");
  const [editingTemplateScope, setEditingTemplateScope] = useState<AssessmentScope>("screening");
  const [editingTemplateContent, setEditingTemplateContent] = useState("");
  const [updatingTemplate, setUpdatingTemplate] = useState(false);
  const [archivingTemplateId, setArchivingTemplateId] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(true);
  const [didDefaultReviewer, setDidDefaultReviewer] = useState(false);
  const [evaluationFilter, setEvaluationFilter] = useState<EvaluationFilter>("all");
  const focusSubmitted = searchParams.get("focus") === "submitted";
  const allAssessments = data?.assessments ?? [];
  const jobScoped = Boolean(scopedJobId);
  const now = Date.now();

  useEffect(() => {
    if (!prefillApplicationId) return;
    const apps = applicationsData?.applications ?? [];
    if (!apps.some((app) => app.id === prefillApplicationId)) return;
    setCreateDraft((prev) =>
      prev.applicationId === prefillApplicationId
        ? prev
        : { ...prev, applicationId: prefillApplicationId },
    );
    setShowCreateForm(true);
  }, [prefillApplicationId, applicationsData?.applications]);

  useEffect(() => {
    if (!focusSubmitted) return;
    setEvaluationFilter("all");
    const section = document.getElementById("evaluation-inbox");
    if (!section) return;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [focusSubmitted, loading]);

  const reviewers = (reviewersData?.members ?? []).filter((member) =>
    ASSESSMENT_REVIEWER_ROLES.includes(member.role as (typeof ASSESSMENT_REVIEWER_ROLES)[number]),
  );

  useEffect(() => {
    if (didDefaultReviewer || !user?.id) return;
    if (reviewers.length === 0) return;
    if (!reviewers.some((member) => member.id === user.id)) {
      setDidDefaultReviewer(true);
      return;
    }
    setCreateDraft((prev) => (prev.reviewerId ? prev : { ...prev, reviewerId: user.id }));
    setDidDefaultReviewer(true);
  }, [didDefaultReviewer, reviewers, user?.id]);

  const starterTemplateOptions = ASSESSMENT_TEMPLATE_LIBRARY[createDraft.type] ?? [];
  const orgTemplateOptions = (templatesData?.templates ?? [])
    .filter((template) => template.type === createDraft.type)
    .map((template) => ({
      key: template.id,
      label: `${template.name} (org · ${template.scope})`,
      content: template.content,
      scope: template.scope,
    }));
  const hasOrgTemplatesForScope = orgTemplateOptions.length > 0;
  /** Org packs first, then TigerHire built-ins — teams keep customs while reusing starters. */
  const templateOptions = [...orgTemplateOptions, ...starterTemplateOptions];

  const canManageTemplates = templatesData?.canManageTemplates === true;
  const templateStudioRoleEligible = TEMPLATE_STUDIO_ROLES.includes(
    (user?.role ?? "") as (typeof TEMPLATE_STUDIO_ROLES)[number],
  );
  const showTemplateStudio = !jobScoped && templateStudioRoleEligible;

  const manageableTemplates = (templatesData?.templates ?? []).filter(
    (template) =>
      template.is_active !== false &&
      (templateFilterType === "all" || template.type === templateFilterType),
  );

  const submittedAssessments = useMemo(
    () =>
      allAssessments
        .filter((assessment) => assessment.status === "submitted")
        .sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime()),
    [allAssessments],
  );

  const activeAssessments = useMemo(
    () =>
      allAssessments
        .filter((assessment) => assessment.status !== "submitted")
        .sort((a, b) => new Date(a.deadline_at).getTime() - new Date(b.deadline_at).getTime()),
    [allAssessments],
  );

  const overdueOpenAssessments = allAssessments.filter(
    (assessment) =>
      ["pending", "submitted"].includes(assessment.status) &&
      new Date(assessment.deadline_at).getTime() < now,
  ).length;
  const pendingDeliveryCount = allAssessments.filter(
    (assessment) => assessment.status === "pending",
  ).length;
  const reviewQueueCount = submittedAssessments.length;
  const completedCount = allAssessments.filter(
    (assessment) => assessment.status === "scored",
  ).length;

  const filteredSubmittedAssessments = submittedAssessments.filter((assessment) => {
    const deadline = new Date(assessment.deadline_at).getTime();
    if (evaluationFilter === "overdue") return deadline < now;
    if (evaluationFilter === "due_soon") {
      return (
        deadline >= now && deadline <= now + ASSESSMENT_EVALUATION_DUE_SOON_HOURS * 60 * 60 * 1000
      );
    }
    return true;
  });

  function applyTemplate() {
    const template = templateOptions.find((option) => option.key === createDraft.templateKey);
    if (!template) return;
    const templateScope: CreateAssessmentDraft["scope"] =
      "scope" in template ? (template.scope as CreateAssessmentDraft["scope"]) : createDraft.scope;
    const scopedHeaderHtml = `<p><strong>Scope:</strong> ${escapeInstructionPlainText(templateScope.toUpperCase())}</p>`;
    const tplConverted = legacyInstructionTextToHtml(template.content);
    const merged =
      tplConverted === "<p></p>"
        ? scopedHeaderHtml.trim()
        : `${scopedHeaderHtml}${tplConverted}`.trim();
    setCreateDraft((prev) => ({
      ...prev,
      scope: templateScope,
      instructions: merged,
    }));
  }

  async function saveTemplate() {
    if (!canManageTemplates) {
      setNotice("Template management is currently unavailable for your account.");
      return;
    }
    const name = templateDraft.name.trim();
    const content = templateDraft.content.trim();
    const visible = assessmentInstructionsVisibleTextApprox(content).trim();
    if (!name || !visible) {
      setNotice("Template name and instructions are required to save.");
      return;
    }
    setSavingTemplate(true);
    setNotice(null);
    try {
      const response = await fetch("/api/assessment-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: templateDraft.type,
          scope: templateDraft.scope,
          name,
          content,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error || "Failed to save template");
        return;
      }
      setTemplateDraft((prev) => ({ ...prev, name: "", content: "" }));
      setTemplateFilterType(templateDraft.type);
      setNotice(`Template saved for ${templateDraft.type} (${templateDraft.scope}).`);
      await refetchTemplates();
    } finally {
      setSavingTemplate(false);
    }
  }

  async function installBuiltInToOrganisation(pack: {
    key: string;
    builderType: AssessmentBuilderType;
    label: string;
    content: string;
  }) {
    if (!canManageTemplates) {
      setNotice("Template management is currently unavailable for your account.");
      return;
    }
    const nameCandidate = builtInPackDisplayName(pack.label).trim();
    const name = nameCandidate.length > 120 ? `${nameCandidate.slice(0, 119)}…` : nameCandidate;
    const content = pack.content.trim();
    const visible = assessmentInstructionsVisibleTextApprox(content).trim();
    if (name.length < 2 || !visible) {
      setNotice("This pack cannot be installed (needs a valid name and instructions body).");
      return;
    }
    setInstallingBuiltInKey(pack.key);
    setNotice(null);
    try {
      const response = await fetch("/api/assessment-templates", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pack.builderType,
          scope: templateDraft.scope,
          name,
          content,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(
          payload.error ??
            "Could not save to the database — ensure migrations are applied (assessment_templates) and your role can manage templates.",
        );
        return;
      }
      cancelEditTemplate();
      setTemplateDraft((prev) => ({ ...prev, type: pack.builderType }));
      setTemplateFilterType(pack.builderType);
      setNotice(
        `Installed "${name}" (${pack.builderType}, ${templateDraft.scope}). You can Edit or Archive it below.`,
      );
      await refetchTemplates();
    } finally {
      setInstallingBuiltInKey(null);
    }
  }

  function beginEditTemplate(template: AssessmentTemplate) {
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    setEditingTemplateScope(template.scope);
    setEditingTemplateContent(template.content);
  }

  function cancelEditTemplate() {
    setEditingTemplateId(null);
    setEditingTemplateName("");
    setEditingTemplateScope("screening");
    setEditingTemplateContent("");
  }

  async function updateTemplate(templateId: string, type: AssessmentRow["type"]) {
    const name = editingTemplateName.trim();
    const content = editingTemplateContent.trim();
    const visible = assessmentInstructionsVisibleTextApprox(content).trim();
    if (!name || !visible) {
      setNotice("Template name and content are required.");
      return;
    }
    setUpdatingTemplate(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/assessment-templates/${templateId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          scope: editingTemplateScope,
          content,
          type,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error || "Failed to update template");
        return;
      }
      cancelEditTemplate();
      setNotice("Template updated.");
      await refetchTemplates();
    } finally {
      setUpdatingTemplate(false);
    }
  }

  async function archiveTemplate(templateId: string) {
    setArchivingTemplateId(templateId);
    setNotice(null);
    try {
      const response = await fetch(`/api/assessment-templates/${templateId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error || "Failed to archive template");
        return;
      }
      if (editingTemplateId === templateId) cancelEditTemplate();
      setNotice("Template archived.");
      await refetchTemplates();
    } finally {
      setArchivingTemplateId(null);
    }
  }

  async function createAssessment() {
    if (!createDraft.applicationId || !createDraft.title.trim() || !createDraft.deadlineAt) {
      setNotice("Application, title, and deadline are required.");
      return;
    }

    setCreating(true);
    setNotice(null);
    try {
      const shareChannels: AssessmentShareChannel[] = [
        ...(createDraft.shareEmail ? (["email"] as const) : []),
        ...(createDraft.shareWhatsapp ? (["whatsapp"] as const) : []),
      ];

      const attachmentLines = createDraft.attachmentLinks
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const attachmentBlockHtml = attachmentLinesToAppendHtml(attachmentLines);
      const finalInstructions = `${createDraft.instructions.trim()}${attachmentBlockHtml}`.trim();

      const response = await fetch("/api/assessments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: createDraft.applicationId,
          stageId: prefillStageId ?? undefined,
          type: createDraft.type,
          title: createDraft.title.trim(),
          instructions: finalInstructions || undefined,
          deadlineAt: new Date(createDraft.deadlineAt).toISOString(),
          reviewerId: createDraft.reviewerId || undefined,
          passThresholdPct: Number.isFinite(Number(createDraft.passThresholdPct))
            ? Number(createDraft.passThresholdPct)
            : undefined,
          autoAdvance: createDraft.autoAdvance,
          shareChannels: shareChannels.length > 0 ? shareChannels : undefined,
          recipientEmail: createDraft.recipientEmail.trim() || undefined,
          recipientPhone: createDraft.recipientPhone.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        share?: {
          shareUrl?: string;
          delivery?: { emailSent: boolean; whatsappSent: boolean } | null;
        };
      };
      if (!response.ok) {
        setNotice(payload.error || "Failed to create assessment");
        return;
      }

      setCreateDraft((prev) => ({
        ...prev,
        title: "",
        instructions: "",
        attachmentLinks: "",
        deadlineAt: "",
      }));

      const delivery = payload.share?.delivery;
      const deliveryStatus = delivery
        ? `email: ${delivery.emailSent ? "sent" : "not sent"}, whatsapp: ${delivery.whatsappSent ? "sent" : "not sent"}`
        : "share pending";

      setNotice(
        payload.share?.shareUrl
          ? `Assessment created. Share link: ${payload.share.shareUrl} (${deliveryStatus})`
          : "Assessment created and assigned.",
      );
      await refetch();
    } finally {
      setCreating(false);
    }
  }

  async function scoreAssessment(assessmentId: string) {
    const draft = scoreDraft[assessmentId];
    const score = Number(draft?.score ?? "");
    const maxScore = Number(draft?.maxScore ?? "");
    if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
      setNotice("Enter valid score and max score before submitting.");
      return;
    }

    setSubmittingId(assessmentId);
    setNotice(null);
    try {
      const response = await fetch(`/api/assessments/${assessmentId}/score`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          score,
          maxScore,
          feedback: draft?.feedback?.trim() || undefined,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        autoAdvanced?: boolean;
      };
      if (!response.ok) {
        setNotice(payload.error || "Failed to score assessment");
        return;
      }
      setNotice(
        payload.autoAdvanced
          ? "Scored. Timeline note saved, candidate notified (if they have an account), and pipeline advanced."
          : "Scored. Timeline note saved and candidate notified when they have an account.",
      );
      await refetch();
    } finally {
      setSubmittingId(null);
    }
  }

  return (
    <>
      {!jobScoped ? (
        <PageHeader
          title="Assessments"
          subtitle="1) Save org templates · 2) Assign and share with a candidate · 3) Rate submissions — results go to candidate notes, the candidate portal, and notifications."
        />
      ) : (
        <div className="mb-4 space-y-2">
          <p className="text-sm text-white/60">
            Assign take-homes and score submissions for this role. Org-wide template studio lives on
            the main assessments page.
          </p>
          <Link
            href={`/recruit/jobs/${scopedJobId}`}
            className="text-sm font-medium text-[var(--accent)] hover:underline"
          >
            Back to plan
          </Link>
        </div>
      )}
      <div className="space-y-4">
        {focusSubmitted ? (
          <p className="rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-[var(--text)]">
            Focus mode is on: the evaluation inbox below is ready for scoring first.
          </p>
        ) : null}

        {notice ? <p className="card-lifted px-3 py-2 text-xs text-white/65">{notice}</p> : null}

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-xl border border-[var(--border)]/20 bg-[var(--surface)]/40 p-4"
              >
                <div className="h-3 w-28 rounded bg-[var(--border)]/30" />
                <div className="mt-3 h-9 w-14 rounded-lg bg-[var(--border)]/30" />
                <div className="mt-2 h-3 w-full rounded bg-[var(--border)]/20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 py-12">
            <p className="px-4 text-center text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-white/60 transition hover:bg-white/[0.04]"
            >
              Retry
            </button>
          </div>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Awaiting review"
              value={reviewQueueCount}
              hint="Submitted assessments waiting for an evaluator."
              tone="accent"
            />
            <MetricCard
              label="Pending delivery"
              value={pendingDeliveryCount}
              hint="Created and shared, but not yet submitted."
            />
            <MetricCard
              label="Overdue"
              value={overdueOpenAssessments}
              hint="Pending or submitted items past their deadline."
              tone={overdueOpenAssessments > 0 ? "warning" : "default"}
            />
            <MetricCard
              label="Completed"
              value={completedCount}
              hint="Scored assessments already closed out."
              tone="success"
            />
          </section>
        )}

        {!loading && !error && allAssessments.length === 0 ? (
          <section className="mx-auto max-w-md card-lifted px-6 py-10 text-center backdrop-blur-md">
            <h2 className="text-base font-semibold text-[var(--text)]">No assessments yet</h2>
            <p className="text-body mt-2 text-sm text-white/60">
              Create one from Assign and send below (pick an application and deadline). Save org
              templates here so the next round stays consistent.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:items-center">
              <Link
                href="/recruit/applications"
                className="text-sm font-medium text-[var(--accent)] transition hover:underline"
              >
                Inbound applications
              </Link>
            </div>
          </section>
        ) : null}

        {showTemplateStudio ? (
          <section className="card-lifted flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-[var(--text)]">Assessment templates</h2>
              <p className="mt-1 max-w-xl text-sm text-white/60">
                Reusable written and take-home packs live in Hiring configuration → Templates.
                {templatesLoading ? " Loading library…" : null}
                {templatesError ? ` (${templatesError})` : null}
              </p>
            </div>
            <Link
              href="/company/settings/templates?tab=assessments"
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15"
            >
              Open Templates
            </Link>
          </section>
        ) : null}

        <CreateCenterSection
          showCreateForm={showCreateForm}
          setShowCreateForm={setShowCreateForm}
          createDraft={createDraft}
          setCreateDraft={setCreateDraft}
          applications={applicationsData?.applications ?? []}
          reviewers={reviewers}
          templateOptions={templateOptions}
          hasOrgTemplatesForScope={hasOrgTemplatesForScope}
          applyTemplate={applyTemplate}
          createAssessment={createAssessment}
          creating={creating}
        />

        <section
          id="evaluation-inbox"
          className={`rounded-xl border p-4 ${
            focusSubmitted
              ? "border-white/15 bg-white/[0.05]"
              : "card-lifted border-[var(--border)]"
          }`}
        >
          <SectionHeader
            eyebrow="Evaluation inbox"
            title="Score submitted work"
            description="Whoever submits the score here is recorded as the rater. The candidate profile gets a timeline note, they see the score (and feedback) in their Assessments page, and logged-in candidates receive an in-app notification."
          />

          <div className="mt-4 flex flex-wrap gap-2">
            <FilterChip
              active={evaluationFilter === "all"}
              onClick={() => setEvaluationFilter("all")}
              label={`All submitted (${submittedAssessments.length})`}
            />
            <FilterChip
              active={evaluationFilter === "due_soon"}
              onClick={() => setEvaluationFilter("due_soon")}
              label={`Due in ${ASSESSMENT_EVALUATION_DUE_SOON_HOURS}h`}
            />
            <FilterChip
              active={evaluationFilter === "overdue"}
              onClick={() => setEvaluationFilter("overdue")}
              label="Overdue"
            />
          </div>

          {filteredSubmittedAssessments.length === 0 ? (
            <div className="mt-4 card-lifted px-4 py-6 text-center">
              <p className="text-sm text-white/60">
                {submittedAssessments.length === 0
                  ? "No submitted assessments in the queue yet. When a candidate returns work, it appears here for scoring."
                  : "No submitted assessments match this filter. Try all submitted or a different time window."}
              </p>
              {evaluationFilter !== "all" && submittedAssessments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setEvaluationFilter("all")}
                  className="mt-3 text-sm font-medium text-[var(--accent)] hover:underline"
                >
                  Show all submitted
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {filteredSubmittedAssessments.map((assessment) => (
                <QueueAssessmentCard
                  key={assessment.id}
                  assessment={assessment}
                  submittingId={submittingId}
                  scoreDraft={scoreDraft}
                  setScoreDraft={setScoreDraft}
                  onScore={scoreAssessment}
                  now={now}
                />
              ))}
            </div>
          )}
        </section>

        <section className="card-lifted p-4">
          <SectionHeader
            eyebrow="Delivery monitor"
            title="In progress and completed"
            description="Pending deliveries, scored items, and other statuses stay here so the inbox above stays action-only."
          />

          {activeAssessments.length === 0 ? (
            <div className="mt-4 card-lifted px-4 py-6 text-center text-sm text-white/60">
              No assessments in progress right now. Create one above when a role needs a written or
              take-home step.
            </div>
          ) : (
            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {activeAssessments.map((assessment) => (
                <AssessmentCard key={assessment.id} assessment={assessment} />
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

export default function RecruitAssessmentsPage() {
  return <RecruitAssessmentsWorkspace />;
}

function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">{title}</h2>
        <p className="mt-1 max-w-2xl text-xs text-white/65">{description}</p>
      </div>
      {action}
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

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active
          ? "bg-white/[0.05] border border-white/10 font-semibold text-white"
          : "bg-transparent border border-white/10 font-medium text-white/55 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function QueueAssessmentCard({
  assessment,
  submittingId,
  scoreDraft,
  setScoreDraft,
  onScore,
  now,
}: {
  assessment: AssessmentRow;
  submittingId: string | null;
  scoreDraft: Record<string, { score: string; maxScore: string; feedback: string }>;
  setScoreDraft: Dispatch<
    SetStateAction<Record<string, { score: string; maxScore: string; feedback: string }>>
  >;
  onScore: (assessmentId: string) => Promise<void>;
  now: number;
}) {
  const deadline = new Date(assessment.deadline_at).getTime();
  const deadlineTone = deadline < now ? "text-amber-300" : "text-white/60";

  return (
    <div className="space-y-3 card-lifted p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{assessment.title}</p>
          <p className={`text-xs ${deadlineTone} tabular-nums`}>
            {getAssessmentTypeLabel(assessment.type)} - due{" "}
            {new Date(assessment.deadline_at).toLocaleString()}
          </p>
        </div>
        {assessment.pass_threshold_pct !== null ? (
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[11px] text-white/65">
            Pass @ {assessment.pass_threshold_pct}%
          </span>
        ) : null}
      </div>

      {assessment.instructions ? (
        <AssessmentInstructionRichHtml
          html={assessment.instructions}
          className="max-h-52 overflow-y-auto"
        />
      ) : null}

      <div className="grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 md:grid-cols-4">
        <input
          type="number"
          min={0}
          step="0.01"
          placeholder="Score"
          value={scoreDraft[assessment.id]?.score ?? ""}
          onChange={(event) =>
            setScoreDraft((prev) => ({
              ...prev,
              [assessment.id]: {
                score: event.target.value,
                maxScore: prev[assessment.id]?.maxScore ?? "100",
                feedback: prev[assessment.id]?.feedback ?? "",
              },
            }))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
        />
        <input
          type="number"
          min={1}
          step="0.01"
          placeholder="Max score"
          value={scoreDraft[assessment.id]?.maxScore ?? "100"}
          onChange={(event) =>
            setScoreDraft((prev) => ({
              ...prev,
              [assessment.id]: {
                score: prev[assessment.id]?.score ?? "",
                maxScore: event.target.value,
                feedback: prev[assessment.id]?.feedback ?? "",
              },
            }))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)]"
        />
        <input
          type="text"
          placeholder="Feedback (optional)"
          value={scoreDraft[assessment.id]?.feedback ?? ""}
          onChange={(event) =>
            setScoreDraft((prev) => ({
              ...prev,
              [assessment.id]: {
                score: prev[assessment.id]?.score ?? "",
                maxScore: prev[assessment.id]?.maxScore ?? "100",
                feedback: event.target.value,
              },
            }))
          }
          className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1 text-xs text-[var(--text)] md:col-span-2"
        />
        <button
          type="button"
          disabled={submittingId === assessment.id}
          onClick={() => onScore(assessment.id)}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
        >
          {submittingId === assessment.id ? "Scoring..." : "Submit score"}
        </button>
      </div>
    </div>
  );
}

function AssessmentCard({ assessment }: { assessment: AssessmentRow }) {
  return (
    <div className="space-y-2 card-lifted p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text)]">{assessment.title}</p>
          <p className="text-xs text-white/65">
            {getAssessmentTypeLabel(assessment.type)} - {assessment.status} - due{" "}
            {new Date(assessment.deadline_at).toLocaleString()}
          </p>
        </div>
        {assessment.status === "scored" && assessment.max_score ? (
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
            {assessment.score ?? 0}/{assessment.max_score}
          </span>
        ) : null}
      </div>
      {assessment.instructions ? (
        <AssessmentInstructionRichHtml
          html={assessment.instructions}
          className="max-h-40 overflow-y-auto"
        />
      ) : null}
    </div>
  );
}
