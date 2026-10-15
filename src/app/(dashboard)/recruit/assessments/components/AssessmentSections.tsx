"use client";

import { type Dispatch, type ReactNode, type SetStateAction, useCallback, useMemo } from "react";
import {
  ASSESSMENT_SCOPE_OPTIONS,
  ASSESSMENT_TEMPLATE_LIBRARY,
  ASSESSMENT_TYPE_OPTIONS,
  builtInPackDisplayName,
  getAssessmentTypeLabel,
  type AssessmentBuilderType,
  type AssessmentScope,
  type AssessmentType,
} from "@/lib/assessments/constants";
import { AssessmentInstructionRichEditor } from "@/components/dashboard/AssessmentInstructionRichEditor";
import {
  AssessmentInstructionRichHtml,
  assessmentInstructionsVisibleTextApprox,
} from "@/components/dashboard/AssessmentInstructionRichHtml";

/** Readable one-liner under titles; keeps manage list short. */
function instructionsSnippet(html: string, maxChars = 140): string {
  const t = assessmentInstructionsVisibleTextApprox(html).replace(/\s+/g, " ").trim();
  if (!t) return "—";
  return t.length <= maxChars ? t : `${t.slice(0, maxChars)}…`;
}

/** Above sticky TopNavigation (z-30): native selects must stack higher so menus aren’t trapped. */
const nativeSelectClasses =
  "relative z-[45] min-h-10 w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]";

const nativeSelectElevatedClasses =
  "relative z-[45] min-h-10 w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text)]";

type CreateAssessmentDraft = {
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
};

type TemplateDraft = {
  type: AssessmentBuilderType;
  scope: AssessmentScope;
  name: string;
  content: string;
};

type ApplicationOption = {
  id: string;
  jobs: { title: string | null } | null;
  candidates: { name: string | null } | null;
};

type ReviewerOption = {
  id: string;
  full_name: string | null;
  role: string;
};

type AssessmentTemplate = {
  id: string;
  type: AssessmentType;
  scope: AssessmentScope;
  name: string;
  content: string;
  is_active?: boolean;
};

export function CreateCenterSection(props: {
  showCreateForm: boolean;
  setShowCreateForm: Dispatch<SetStateAction<boolean>>;
  createDraft: CreateAssessmentDraft;
  setCreateDraft: Dispatch<SetStateAction<CreateAssessmentDraft>>;
  applications: ApplicationOption[];
  reviewers: ReviewerOption[];
  templateOptions: Array<{ key: string; label: string }>;
  hasOrgTemplatesForScope: boolean;
  applyTemplate: () => void;
  createAssessment: () => Promise<void>;
  creating: boolean;
}) {
  const {
    showCreateForm,
    setShowCreateForm,
    createDraft,
    setCreateDraft,
    applications,
    reviewers,
    templateOptions,
    hasOrgTemplatesForScope,
    applyTemplate,
    createAssessment,
    creating,
  } = props;

  const hydrateAssign = useMemo(
    () => `assign-${createDraft.applicationId}-${createDraft.type}-${createDraft.scope}`,
    [createDraft.applicationId, createDraft.scope, createDraft.type],
  );

  const onInstructionsHtmlChange = useCallback(
    (html: string) =>
      setCreateDraft((previous) =>
        previous.instructions === html ? previous : { ...previous, instructions: html },
      ),
    [setCreateDraft],
  );

  return (
    <div className="card-lifted p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Assign and send
          </p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">
            Give a candidate an assessment
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-white/60">
            Recruiters, hiring managers, and interviewers can assign manually. Pick a reviewer when
            you want a nudge; scoring always records who rated the work on the candidate timeline.
            Optional email/WhatsApp sends the secure link.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((prev) => !prev)}
          className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition hover:bg-[var(--bg)]"
        >
          {showCreateForm ? "Collapse" : "Open builder"}
        </button>
      </div>

      {showCreateForm ? (
        <>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <select
              value={createDraft.applicationId}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, applicationId: event.target.value }))
              }
              className={nativeSelectClasses}
            >
              <option value="">Select application</option>
              {applications.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.jobs?.title ?? "Untitled role"} -{" "}
                  {application.candidates?.name ?? "Candidate"}
                </option>
              ))}
            </select>
            <select
              value={createDraft.type}
              onChange={(event) =>
                setCreateDraft((prev) => ({
                  ...prev,
                  type: event.target.value as AssessmentBuilderType,
                  templateKey: "",
                }))
              }
              className={nativeSelectClasses}
            >
              {ASSESSMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={createDraft.scope}
              onChange={(event) =>
                setCreateDraft((prev) => ({
                  ...prev,
                  scope: event.target.value as AssessmentScope,
                }))
              }
              className={nativeSelectClasses}
            >
              {ASSESSMENT_SCOPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  Scope: {option.label}
                </option>
              ))}
            </select>
            <select
              value={createDraft.reviewerId}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, reviewerId: event.target.value }))
              }
              className={nativeSelectClasses}
            >
              <option value="">Reviewer (optional nudge)</option>
              {reviewers.map((reviewer) => (
                <option key={reviewer.id} value={reviewer.id}>
                  {(reviewer.full_name ?? "Team member").trim()} ({reviewer.role})
                </option>
              ))}
            </select>
            <div className="flex gap-2 md:col-span-2">
              <select
                value={createDraft.templateKey}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, templateKey: event.target.value }))
                }
                className={`${nativeSelectClasses} min-w-0 flex-1`}
              >
                <option value="">Choose template (optional)</option>
                {templateOptions.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={applyTemplate}
                disabled={!createDraft.templateKey}
                className="rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
              >
                Use template
              </button>
            </div>
            <p className="md:col-span-2 text-[11px] text-white/60">
              {hasOrgTemplatesForScope
                ? "Organisation packs are listed first — TigerHire built-ins follow in the same list."
                : "TigerHire built‑in packs are loaded below. Save custom packs in Template library anytime."}
            </p>
            <input
              type="text"
              placeholder="Assessment title"
              value={createDraft.title}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, title: event.target.value }))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"
            />
            <input
              type="datetime-local"
              value={createDraft.deadlineAt}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, deadlineAt: event.target.value }))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"
            />
            <input
              type="number"
              min={0}
              max={100}
              step="1"
              placeholder="Pass threshold %"
              value={createDraft.passThresholdPct}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, passThresholdPct: event.target.value }))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"
            />
          </div>

          <p className="mt-3 text-[11px] text-white/55">
            <strong className="text-white/65">Brief &amp; materials:</strong> use the editor for
            formatting and <span className="text-white/65">links</span> (docs, forms, repos).
            Uploaded files stay outside TigerHire — paste HTTPS links to Drive, Dropbox, GitHub,
            etc. Lines under &quot;Attachment links&quot; are merged as a link list under your brief
            when you create the assessment.
          </p>

          <div className="mt-2">
            <AssessmentInstructionRichEditor
              hydrateKey={hydrateAssign}
              minEditorHeightPx={220}
              valueHtml={createDraft.instructions}
              onHtmlChange={onInstructionsHtmlChange}
              placeholder="Write the brief… Use the toolbar or paste links."
            />
          </div>

          <textarea
            rows={2}
            placeholder="Attachment/reference links (one per line)"
            value={createDraft.attachmentLinks}
            onChange={(event) =>
              setCreateDraft((prev) => ({ ...prev, attachmentLinks: event.target.value }))
            }
            className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"
          />
          <p className="mt-2 text-[11px] text-white/60">
            Live builder support today is focused on written and take-home workflows.
            Supplier-backed MCQ, coding, and psychometric flows should be treated as future
            expansion until the builder and validations are widened.
          </p>
          <label className="mt-2 flex items-center gap-2 text-xs text-white/60">
            <input
              type="checkbox"
              checked={createDraft.autoAdvance}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, autoAdvance: event.target.checked }))
              }
            />
            Auto-advance after scoring when the linked stage and threshold rules are in place
          </label>

          <div className="mt-2 grid gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3">
            <p className="text-xs font-semibold text-[var(--text)]">Share assessment</p>
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={createDraft.shareEmail}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, shareEmail: event.target.checked }))
                }
              />
              Send via email
            </label>
            <label className="flex items-center gap-2 text-xs text-white/60">
              <input
                type="checkbox"
                checked={createDraft.shareWhatsapp}
                onChange={(event) =>
                  setCreateDraft((prev) => ({ ...prev, shareWhatsapp: event.target.checked }))
                }
              />
              Send via WhatsApp
            </label>
            <input
              type="email"
              placeholder="Override email (optional)"
              value={createDraft.recipientEmail}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, recipientEmail: event.target.value }))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text)]"
            />
            <input
              type="tel"
              placeholder="Override WhatsApp phone (optional)"
              value={createDraft.recipientPhone}
              onChange={(event) =>
                setCreateDraft((prev) => ({ ...prev, recipientPhone: event.target.value }))
              }
              className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text)]"
            />
          </div>

          <button
            type="button"
            onClick={createAssessment}
            disabled={creating}
            className="mt-3 rounded-full bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create assessment"}
          </button>
        </>
      ) : (
        <p className="mt-3 text-xs text-white/60">
          Open the builder when you are ready to assign a new assessment.
        </p>
      )}
    </div>
  );
}

export function TemplateStudioSection(props: {
  canManageTemplates: boolean;
  templateDraft: TemplateDraft;
  setTemplateDraft: Dispatch<SetStateAction<TemplateDraft>>;
  saveTemplate: () => Promise<void>;
  savingTemplate: boolean;
  templateFilterType: AssessmentBuilderType | "all";
  setTemplateFilterType: Dispatch<SetStateAction<AssessmentBuilderType | "all">>;
  manageableTemplates: AssessmentTemplate[];
  editingTemplateId: string | null;
  editingTemplateName: string;
  setEditingTemplateName: Dispatch<SetStateAction<string>>;
  editingTemplateScope: AssessmentScope;
  setEditingTemplateScope: Dispatch<SetStateAction<AssessmentScope>>;
  editingTemplateContent: string;
  setEditingTemplateContent: Dispatch<SetStateAction<string>>;
  updatingTemplate: boolean;
  updateTemplate: (templateId: string, type: AssessmentTemplate["type"]) => Promise<void>;
  beginEditTemplate: (template: AssessmentTemplate) => void;
  cancelEditTemplate: () => void;
  archivingTemplateId: string | null;
  archiveTemplate: (templateId: string) => Promise<void>;
  installBuiltInToOrganisation: (pack: {
    key: string;
    builderType: AssessmentBuilderType;
    label: string;
    content: string;
  }) => Promise<void>;
  installingBuiltInKey: string | null;
  FilterChip: (props: { active: boolean; onClick: () => void; label: string }) => ReactNode;
}) {
  const {
    canManageTemplates,
    templateDraft,
    setTemplateDraft,
    saveTemplate,
    savingTemplate,
    templateFilterType,
    setTemplateFilterType,
    manageableTemplates,
    editingTemplateId,
    editingTemplateName,
    setEditingTemplateName,
    editingTemplateScope,
    setEditingTemplateScope,
    editingTemplateContent,
    setEditingTemplateContent,
    updatingTemplate,
    updateTemplate,
    beginEditTemplate,
    cancelEditTemplate,
    archivingTemplateId,
    archiveTemplate,
    installBuiltInToOrganisation,
    installingBuiltInKey,
    FilterChip,
  } = props;

  const hydrateNewTemplate = useMemo(
    () => `tpl-new-${templateDraft.type}-${templateDraft.scope}`,
    [templateDraft.scope, templateDraft.type],
  );

  const onNewTemplateHtmlChange = useCallback(
    (html: string) =>
      setTemplateDraft((previous) =>
        previous.content === html ? previous : { ...previous, content: html },
      ),
    [setTemplateDraft],
  );

  const onEditTemplateHtmlChange = useCallback(
    (html: string) =>
      setEditingTemplateContent((previous) => (previous === html ? previous : html)),
    [setEditingTemplateContent],
  );

  const filteredBuiltIns = useMemo(() => {
    type Pack = (typeof ASSESSMENT_TEMPLATE_LIBRARY.written)[number] & {
      builderType: AssessmentBuilderType;
    };
    const annotate = (
      packs: (typeof ASSESSMENT_TEMPLATE_LIBRARY)[AssessmentBuilderType],
      builderType: AssessmentBuilderType,
    ): Pack[] => packs.map((pack) => ({ ...pack, builderType }));

    if (templateFilterType === "all") {
      return [
        ...annotate(ASSESSMENT_TEMPLATE_LIBRARY.written, "written"),
        ...annotate(ASSESSMENT_TEMPLATE_LIBRARY.take_home, "take_home"),
      ];
    }
    return annotate(ASSESSMENT_TEMPLATE_LIBRARY[templateFilterType], templateFilterType);
  }, [templateFilterType]);

  const copyBuiltInToDraft = useCallback(
    (pack: (typeof filteredBuiltIns)[number]) => {
      setTemplateDraft((prev) => ({
        ...prev,
        type: pack.builderType,
        name: builtInPackDisplayName(pack.label),
        content: pack.content,
      }));
      cancelEditTemplate();
      requestAnimationFrame(() => {
        document.getElementById("assessment-template-library-create")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    },
    [cancelEditTemplate, setTemplateDraft],
  );

  return (
    <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <div
        id="assessment-template-library-create"
        className="relative z-0 isolate overflow-visible card-lifted p-4"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Template library
          </p>
          <h2 className="mt-1 text-sm font-semibold text-[var(--text)]">Create reusable packs</h2>
          <p className="mt-1 max-w-2xl text-[11px] leading-snug text-white/56">
            Type + round (scope) → name → body. Installing a built‑in saves over there using the
            Scope you pick here.
          </p>
        </div>
        {!canManageTemplates ? (
          <p className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
            Studio is visible, but create/edit actions are disabled until template permissions are
            enabled.
          </p>
        ) : null}

        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <select
            value={templateDraft.type}
            onChange={(event) =>
              setTemplateDraft((prev) => ({
                ...prev,
                type: event.target.value as AssessmentBuilderType,
              }))
            }
            className={nativeSelectClasses}
          >
            {ASSESSMENT_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Type: {option.label}
              </option>
            ))}
          </select>
          <select
            value={templateDraft.scope}
            onChange={(event) =>
              setTemplateDraft((prev) => ({
                ...prev,
                scope: event.target.value as AssessmentScope,
              }))
            }
            className={nativeSelectClasses}
          >
            {ASSESSMENT_SCOPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                Scope: {option.label}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          placeholder="Template name"
          value={templateDraft.name}
          onChange={(event) => setTemplateDraft((prev) => ({ ...prev, name: event.target.value }))}
          className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-2 text-xs text-[var(--text)]"
        />
        <p className="mt-2 text-[11px] text-white/55">
          Rich text · links · lists · headings. Files stay hosted elsewhere — paste https links into
          the brief.
        </p>
        <div className="mt-2">
          <AssessmentInstructionRichEditor
            hydrateKey={hydrateNewTemplate}
            minEditorHeightPx={148}
            valueHtml={templateDraft.content}
            onHtmlChange={onNewTemplateHtmlChange}
            placeholder="Template instructions candidates and reviewers will reuse…"
          />
        </div>
        <button
          type="button"
          onClick={saveTemplate}
          disabled={savingTemplate || !canManageTemplates}
          className="mt-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] disabled:opacity-50"
        >
          {savingTemplate ? "Saving..." : "Create template"}
        </button>
      </div>

      <div className="relative z-0 isolate overflow-visible card-lifted p-4">
        <div className="space-y-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
            Manage templates
          </p>
          <h2 className="text-sm font-semibold text-[var(--text)]">Organisation catalogue</h2>
          <p className="text-[11px] leading-snug text-white/52">
            Chips filter the list · long HTML stays inside “preview” folds · installs use Scope from
            the left.
          </p>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <FilterChip
            active={templateFilterType === "all"}
            onClick={() => setTemplateFilterType("all")}
            label="All"
          />
          {ASSESSMENT_TYPE_OPTIONS.map((option) => (
            <FilterChip
              key={option.value}
              active={templateFilterType === option.value}
              onClick={() => setTemplateFilterType(option.value)}
              label={option.label}
            />
          ))}
        </div>

        {!canManageTemplates ? (
          <p className="mt-2 text-[11px] leading-snug text-white/54">
            Read-only here — use Assign and send → Choose template to drop a brief into an
            assessment.
          </p>
        ) : null}

        <div className="mt-2 space-y-3">
          {filteredBuiltIns.length > 0 ? (
            <details className="overflow-visible rounded-lg border border-[var(--border)] bg-[var(--bg)]/95">
              <summary className="cursor-pointer select-none px-2.5 py-2 text-[11px] font-medium text-[var(--text)]">
                TigerHire built-ins ({filteredBuiltIns.length}) — tap to browse / install —{" "}
                <span className="font-normal text-white/43">scoped via left dropdown</span>
              </summary>
              <div className="max-h-[min(38vh,19rem)] space-y-2 overflow-x-visible overflow-y-auto overscroll-contain border-t border-[var(--border)] px-2 py-2">
                {filteredBuiltIns.map((pack) => (
                  <div
                    key={pack.key}
                    className="rounded-md border border-[var(--border)] border-dashed bg-[var(--bg)] p-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold leading-tight text-[var(--text)]">
                          {builtInPackDisplayName(pack.label)}
                        </p>
                        <p className="mt-0.5 text-[10px] text-white/44">
                          {getAssessmentTypeLabel(pack.builderType)}
                        </p>
                        <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/43">
                          {instructionsSnippet(pack.content, 180)}
                        </p>
                      </div>
                    </div>
                    <details className="mt-2 overflow-visible rounded-md border border-white/[0.08] bg-black/15 [&_summary::-webkit-details-marker]:hidden">
                      <summary className="cursor-pointer select-none px-2 py-1 text-[10px] text-white/48">
                        Full rendered preview
                      </summary>
                      <div className="px-2 pb-2">
                        <AssessmentInstructionRichHtml
                          html={pack.content}
                          className="max-h-[min(30vh,11rem)] overflow-y-auto"
                        />
                      </div>
                    </details>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={!canManageTemplates}
                        title={
                          canManageTemplates
                            ? "Opens in the composer on the left"
                            : "Template creation is disabled for your role"
                        }
                        onClick={() => copyBuiltInToDraft(pack)}
                        className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[10px] font-medium text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        disabled={
                          !canManageTemplates ||
                          installingBuiltInKey !== null ||
                          savingTemplate ||
                          updatingTemplate
                        }
                        title={
                          canManageTemplates
                            ? `POST to org DB — Scope: ${templateDraft.scope}`
                            : "Template creation is disabled for your role"
                        }
                        onClick={() => void installBuiltInToOrganisation(pack)}
                        className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10px] font-semibold text-black disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {installingBuiltInKey === pack.key ? "Saving…" : "Install"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {canManageTemplates ? (
            manageableTemplates.length === 0 ? (
              <p className="text-[11px] text-white/54">
                No saved org packs — open built-ins ↑ and{" "}
                <strong className="text-white/72">Install</strong>, or{" "}
                <strong className="text-white/72">Copy</strong> → Create template.
              </p>
            ) : (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/42">
                  Your organisation ({manageableTemplates.length})
                </p>
                {manageableTemplates.map((template) => (
                  <div
                    key={template.id}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-2"
                  >
                    {editingTemplateId === template.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editingTemplateName}
                          onChange={(event) => setEditingTemplateName(event.target.value)}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-2 text-xs text-[var(--text)]"
                        />
                        <select
                          value={editingTemplateScope}
                          onChange={(event) =>
                            setEditingTemplateScope(event.target.value as AssessmentScope)
                          }
                          className={nativeSelectElevatedClasses}
                        >
                          {ASSESSMENT_SCOPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <div className="mt-2">
                          <AssessmentInstructionRichEditor
                            hydrateKey={`edit-${editingTemplateId}`}
                            minEditorHeightPx={160}
                            valueHtml={editingTemplateContent}
                            onHtmlChange={onEditTemplateHtmlChange}
                            placeholder="Edit template body…"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={updatingTemplate}
                            onClick={() => updateTemplate(template.id, template.type)}
                            className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-semibold text-black disabled:opacity-50"
                          >
                            {updatingTemplate ? "Saving..." : "Save changes"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEditTemplate}
                            className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-white/60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-semibold text-[var(--text)]">
                              {template.name}
                            </p>
                            <p className="text-[10px] text-white/45">
                              {getAssessmentTypeLabel(template.type)} · {template.scope}
                            </p>
                            <p className="mt-1 line-clamp-2 text-[10px] leading-snug text-white/42">
                              {instructionsSnippet(template.content, 200)}
                            </p>
                          </div>
                          <div className="flex shrink-0 gap-1.5">
                            <button
                              type="button"
                              onClick={() => beginEditTemplate(template)}
                              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] font-medium text-[var(--text)]"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              disabled={archivingTemplateId === template.id}
                              onClick={() => archiveTemplate(template.id)}
                              className="rounded-full border border-red-500/35 px-2 py-0.5 text-[10px] text-red-300 disabled:opacity-50"
                            >
                              {archivingTemplateId === template.id ? "…" : "Archive"}
                            </button>
                          </div>
                        </div>
                        <details className="overflow-visible rounded-md border border-white/[0.06] bg-black/[0.12] [&_summary::-webkit-details-marker]:hidden">
                          <summary className="cursor-pointer select-none px-2 py-1 text-[10px] text-white/45">
                            Rendered preview
                          </summary>
                          <div className="px-2 pb-2">
                            <AssessmentInstructionRichHtml
                              html={template.content}
                              className="max-h-[min(32vh,12rem)] overflow-y-auto"
                            />
                          </div>
                        </details>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
