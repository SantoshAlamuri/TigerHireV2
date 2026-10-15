"use client";

import Link from "next/link";
import { TemplateStudioSection } from "@/app/(dashboard)/recruit/assessments/components/AssessmentSections";
import { useAssessmentTemplateLibrary } from "@/components/settings/hooks/useAssessmentTemplateLibrary";

export function AssessmentTemplateLibraryPanel({
  assessmentsHref = "/recruit/assessments",
}: {
  assessmentsHref?: string;
}) {
  const library = useAssessmentTemplateLibrary();

  if (!library.canAccessStudio) {
    return (
      <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        Your role cannot manage assessment templates. Ask an admin to enable template permissions
        under Organisation → Permissions.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-white/60">
        Reusable written and take-home packs for screening, shortlist, and final rounds. Assign them
        when creating assessments from{" "}
        <Link href={assessmentsHref} className="font-medium text-[var(--accent)] hover:underline">
          Assessments
        </Link>
        .
      </p>

      {library.notice ? (
        <p className="rounded-xl border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-white/75">
          {library.notice}
        </p>
      ) : null}

      {library.templatesLoading ? (
        <div className="h-9 animate-pulse rounded-xl border border-[var(--border)]/20 bg-[var(--surface)]/30" />
      ) : null}

      {library.templatesError ? (
        <div className="flex flex-col items-stretch gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-300">Template service: {library.templatesError}</p>
          <button
            type="button"
            onClick={() => void library.refetchTemplates()}
            className="self-center rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-white/60 sm:self-auto"
          >
            Retry
          </button>
        </div>
      ) : null}

      {library.templatesData?.warning ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {library.templatesData.warning}
        </p>
      ) : null}

      {!library.templatesLoading && !library.templatesError && !library.canManageTemplates ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Template management is disabled for this role in company settings permissions.
        </p>
      ) : null}

      {!library.templatesLoading && !library.templatesError ? (
        <TemplateStudioSection
          canManageTemplates={library.canManageTemplates}
          templateDraft={library.templateDraft}
          setTemplateDraft={library.setTemplateDraft}
          saveTemplate={library.saveTemplate}
          savingTemplate={library.savingTemplate}
          templateFilterType={library.templateFilterType}
          setTemplateFilterType={library.setTemplateFilterType}
          manageableTemplates={library.manageableTemplates}
          editingTemplateId={library.editingTemplateId}
          editingTemplateName={library.editingTemplateName}
          setEditingTemplateName={library.setEditingTemplateName}
          editingTemplateScope={library.editingTemplateScope}
          setEditingTemplateScope={library.setEditingTemplateScope}
          editingTemplateContent={library.editingTemplateContent}
          setEditingTemplateContent={library.setEditingTemplateContent}
          updatingTemplate={library.updatingTemplate}
          updateTemplate={library.updateTemplate}
          beginEditTemplate={library.beginEditTemplate}
          cancelEditTemplate={library.cancelEditTemplate}
          archivingTemplateId={library.archivingTemplateId}
          archiveTemplate={library.archiveTemplate}
          installBuiltInToOrganisation={library.installBuiltInToOrganisation}
          installingBuiltInKey={library.installingBuiltInKey}
          FilterChip={library.FilterChip}
        />
      ) : null}
    </div>
  );
}
