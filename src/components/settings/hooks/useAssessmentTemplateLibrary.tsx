"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ASSESSMENT_TEMPLATE_LIBRARY,
  TEMPLATE_STUDIO_ROLES,
  builtInPackDisplayName,
  type AssessmentBuilderType,
  type AssessmentScope,
  type AssessmentType,
} from "@/lib/assessments/constants";
import { assessmentInstructionsVisibleTextApprox } from "@/components/dashboard/AssessmentInstructionRichHtml";
import { useApiQuery } from "@/lib/hooks/use-api";
import { useAuth } from "@/lib/auth/AuthProvider";

type TemplateDraft = {
  type: AssessmentBuilderType;
  scope: AssessmentScope;
  name: string;
  content: string;
};

export type AssessmentTemplateRow = {
  id: string;
  type: AssessmentType;
  scope: AssessmentScope;
  name: string;
  content: string;
  is_active?: boolean;
};

export function useAssessmentTemplateLibrary() {
  const { user } = useAuth();
  const {
    data: templatesData,
    loading: templatesLoading,
    error: templatesError,
    refetch: refetchTemplates,
  } = useApiQuery<{
    templates: AssessmentTemplateRow[];
    canManageTemplates: boolean;
    warning?: string;
  }>("/api/assessment-templates");

  const [notice, setNotice] = useState<string | null>(null);
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

  const canManageTemplates = templatesData?.canManageTemplates === true;
  const templateStudioRoleEligible = TEMPLATE_STUDIO_ROLES.includes(
    (user?.role ?? "") as (typeof TEMPLATE_STUDIO_ROLES)[number],
  );
  const canAccessStudio = templateStudioRoleEligible;

  const manageableTemplates = (templatesData?.templates ?? []).filter(
    (template) =>
      template.is_active !== false &&
      (templateFilterType === "all" || template.type === templateFilterType),
  );

  const cancelEditTemplate = useCallback(() => {
    setEditingTemplateId(null);
    setEditingTemplateName("");
    setEditingTemplateScope("screening");
    setEditingTemplateContent("");
  }, []);

  const beginEditTemplate = useCallback((template: AssessmentTemplateRow) => {
    setEditingTemplateId(template.id);
    setEditingTemplateName(template.name);
    setEditingTemplateScope(template.scope);
    setEditingTemplateContent(template.content);
  }, []);

  const saveTemplate = useCallback(async () => {
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
  }, [canManageTemplates, refetchTemplates, templateDraft]);

  const installBuiltInToOrganisation = useCallback(
    async (pack: {
      key: string;
      builderType: AssessmentBuilderType;
      label: string;
      content: string;
    }) => {
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
          `Installed "${name}" (${pack.builderType}, ${templateDraft.scope}). You can edit or archive it below.`,
        );
        await refetchTemplates();
      } finally {
        setInstallingBuiltInKey(null);
      }
    },
    [canManageTemplates, cancelEditTemplate, refetchTemplates, templateDraft.scope],
  );

  const updateTemplate = useCallback(
    async (templateId: string, type: AssessmentType) => {
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
    },
    [
      cancelEditTemplate,
      editingTemplateContent,
      editingTemplateName,
      editingTemplateScope,
      refetchTemplates,
    ],
  );

  const archiveTemplate = useCallback(
    async (templateId: string) => {
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
    },
    [cancelEditTemplate, editingTemplateId, refetchTemplates],
  );

  const FilterChip = useCallback(
    (props: { active: boolean; onClick: () => void; label: string }) => (
      <button
        type="button"
        onClick={props.onClick}
        className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
          props.active
            ? "border-[var(--accent)]/50 bg-[var(--accent)]/12 text-[var(--accent)]"
            : "border-[var(--border)] text-white/60 hover:text-white"
        }`}
      >
        {props.label}
      </button>
    ),
    [],
  );

  const builtInCount = useMemo(() => {
    return (
      ASSESSMENT_TEMPLATE_LIBRARY.written.length + ASSESSMENT_TEMPLATE_LIBRARY.take_home.length
    );
  }, []);

  return {
    notice,
    setNotice,
    templatesLoading,
    templatesError,
    refetchTemplates,
    templatesData,
    canManageTemplates,
    canAccessStudio,
    templateDraft,
    setTemplateDraft,
    savingTemplate,
    saveTemplate,
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
    builtInCount,
  };
}
