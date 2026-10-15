"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Star } from "lucide-react";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { useApiQuery } from "@/lib/hooks/use-api";
import { offerTemplateBodyToPdfPlainText } from "@/lib/offers/offer-template-html-to-plain";
import { OfferLetterTemplateRichEditor } from "@/components/settings/OfferLetterTemplateRichEditor";
import { OfferLetterMergeFieldsTable } from "@/components/settings/OfferLetterMergeFieldsTable";
import { OfferLetterCustomMergeFieldsEditor } from "@/components/settings/OfferLetterCustomMergeFieldsEditor";
import type { OfferCustomMergeFieldDef } from "@/lib/offers/offer-custom-merge-fields";
import { DEFAULT_OFFER_TEMPLATE_BODY } from "@/lib/offers/default-offer-template-body";
import type { OfferTemplateSelectionRules } from "@/lib/offers/offer-template-selection-rules";

type TemplateRow = {
  id: string;
  name: string;
  is_default: boolean;
  bodyText: string;
  latestVersionNumber: number;
  customMergeFieldDefs: OfferCustomMergeFieldDef[];
  selectionRules: OfferTemplateSelectionRules;
};

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function listToCsv(value: string[] | undefined): string {
  return (value ?? []).join(", ");
}

function OfferLetterTemplatesLead() {
  return (
    <header>
      <h2 className="text-lg font-semibold tracking-tight text-[var(--text)]">
        Offer letter template
      </h2>
      <p className="mt-1 text-sm text-[var(--text-muted)]">
        Use the merge-field table for placeholders, then compose the letter in the editor. The
        toolbar supports headings, lists, alignment, links, quotes, highlights, and more; the
        generated offer PDF still uses a plain layout derived from your content. Values for{" "}
        <code className="text-[var(--text)]">{"{{…}}"}</code> tokens are filled when the offer is
        sent.
      </p>
    </header>
  );
}

export function OfferLetterTemplatesPanel() {
  const { data, loading, error, refetch } = useApiQuery<{ templates: TemplateRow[] }>(
    "/api/offer-pdf-templates",
  );
  const templates = data?.templates ?? [];
  const [activeTemplateId, setActiveTemplateId] = useState<string>("");
  const defaultTemplate = useMemo(
    () => templates.find((t) => t.is_default) ?? templates[0] ?? null,
    [templates],
  );
  const activeTemplate =
    (activeTemplateId ? templates.find((t) => t.id === activeTemplateId) : null) ?? defaultTemplate;

  const [draftHtml, setDraftHtml] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [markingDefault, setMarkingDefault] = useState(false);
  const [creatingTemplate, setCreatingTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [rulesSaving, setRulesSaving] = useState(false);
  const [roleTitleRulesCsv, setRoleTitleRulesCsv] = useState("");
  const [locationRulesCsv, setLocationRulesCsv] = useState("");
  const [employmentTypeRulesCsv, setEmploymentTypeRulesCsv] = useState("");
  const [seniorityRulesCsv, setSeniorityRulesCsv] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setDraftHtml(null);
  }, [activeTemplate?.id, activeTemplate?.latestVersionNumber]);

  useEffect(() => {
    setRoleTitleRulesCsv(listToCsv(activeTemplate?.selectionRules?.roleTitleContains));
    setLocationRulesCsv(listToCsv(activeTemplate?.selectionRules?.locations));
    setEmploymentTypeRulesCsv(listToCsv(activeTemplate?.selectionRules?.employmentTypes));
    setSeniorityRulesCsv(listToCsv(activeTemplate?.selectionRules?.seniorityLevels));
  }, [activeTemplate?.id, activeTemplate?.selectionRules]);

  useEffect(() => {
    if (!templates.length) {
      setActiveTemplateId("");
      return;
    }
    setActiveTemplateId((prev) =>
      prev && templates.some((t) => t.id === prev) ? prev : (defaultTemplate?.id ?? ""),
    );
  }, [templates, defaultTemplate?.id]);

  const hydrateKey = useMemo(
    () => `${activeTemplate?.id ?? ""}-v${activeTemplate?.latestVersionNumber ?? 0}`,
    [activeTemplate?.id, activeTemplate?.latestVersionNumber],
  );

  const onHtmlChange = useCallback((html: string) => {
    setDraftHtml(html);
  }, []);

  const bodyForSave = (draftHtml ?? activeTemplate?.bodyText ?? "").trim();
  const plainApprox = offerTemplateBodyToPdfPlainText(bodyForSave).replace(/\s+/g, " ").trim();
  const canSave = plainApprox.length >= 20;

  async function save() {
    if (!activeTemplate) return;
    setSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const res = await fetch(`/api/offer-pdf-templates/${activeTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ bodyText: bodyForSave }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not save template.");
        return;
      }
      setNotice("Saved a new template version. Future sends use the latest version.");
      await refetch();
    } catch {
      setSaveError("Could not save template.");
    } finally {
      setSaving(false);
    }
  }

  async function makeDefault() {
    if (!activeTemplate || activeTemplate.is_default) return;
    setMarkingDefault(true);
    setNotice(null);
    setSaveError(null);
    try {
      const res = await fetch(`/api/offer-pdf-templates/${activeTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ setDefault: true }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not set default template.");
        return;
      }
      setNotice(`"${activeTemplate.name}" is now the default template for new offers.`);
      await refetch();
    } catch {
      setSaveError("Could not set default template.");
    } finally {
      setMarkingDefault(false);
    }
  }

  async function createTemplate() {
    const name = newTemplateName.trim() || "Custom offer letter";
    setCreatingTemplate(true);
    setNotice(null);
    setSaveError(null);
    try {
      const seedBody = (activeTemplate?.bodyText ?? DEFAULT_OFFER_TEMPLATE_BODY).trim();
      const res = await fetch("/api/offer-pdf-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, bodyText: seedBody, setDefault: false }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; templateId?: string };
      if (!res.ok || !json.templateId) {
        setSaveError(json.error ?? "Could not create template.");
        return;
      }
      setNotice(`Created template "${name}".`);
      setNewTemplateName("");
      await refetch();
      setActiveTemplateId(json.templateId);
    } catch {
      setSaveError("Could not create template.");
    } finally {
      setCreatingTemplate(false);
    }
  }

  async function saveSelectionRules() {
    if (!activeTemplate) return;
    setRulesSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const res = await fetch(`/api/offer-pdf-templates/${activeTemplate.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          selectionRules: {
            roleTitleContains: csvToList(roleTitleRulesCsv),
            locations: csvToList(locationRulesCsv),
            employmentTypes: csvToList(employmentTypeRulesCsv),
            seniorityLevels: csvToList(seniorityRulesCsv),
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not save assignment rules.");
        return;
      }
      setNotice("Template assignment rules saved.");
      await refetch({ silent: true });
    } catch {
      setSaveError("Could not save assignment rules.");
    } finally {
      setRulesSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <OfferLetterTemplatesLead />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <Loader2 size={16} className="animate-spin" />
          Loading templates…
        </div>
      ) : null}
      {error ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </p>
      ) : null}
      {!loading && !activeTemplate ? (
        <p className="text-sm text-[var(--text-muted)]">No template found for your organisation.</p>
      ) : null}

      {activeTemplate ? (
        <SettingsEditableForm>
          <TemplateEditorSection
            templates={templates}
            activeTemplate={activeTemplate}
            hydrateKey={hydrateKey}
            onTemplateChange={setActiveTemplateId}
            newTemplateName={newTemplateName}
            onNewTemplateNameChange={setNewTemplateName}
            onCreateTemplate={() => void createTemplate()}
            creatingTemplate={creatingTemplate}
            onMakeDefault={() => void makeDefault()}
            makingDefault={markingDefault}
            roleTitleRulesCsv={roleTitleRulesCsv}
            onRoleTitleRulesCsvChange={setRoleTitleRulesCsv}
            locationRulesCsv={locationRulesCsv}
            onLocationRulesCsvChange={setLocationRulesCsv}
            employmentTypeRulesCsv={employmentTypeRulesCsv}
            onEmploymentTypeRulesCsvChange={setEmploymentTypeRulesCsv}
            seniorityRulesCsv={seniorityRulesCsv}
            onSeniorityRulesCsvChange={setSeniorityRulesCsv}
            onSaveSelectionRules={() => void saveSelectionRules()}
            rulesSaving={rulesSaving}
            onHtmlChange={onHtmlChange}
            notice={notice}
            saveError={saveError}
            canSave={canSave}
            saving={saving}
            onSave={() => void save()}
            refetchTemplates={refetch}
          />
        </SettingsEditableForm>
      ) : null}
    </div>
  );
}

function TemplateEditorSection({
  templates,
  activeTemplate,
  hydrateKey,
  onTemplateChange,
  newTemplateName,
  onNewTemplateNameChange,
  onCreateTemplate,
  creatingTemplate,
  onMakeDefault,
  makingDefault,
  roleTitleRulesCsv,
  onRoleTitleRulesCsvChange,
  locationRulesCsv,
  onLocationRulesCsvChange,
  employmentTypeRulesCsv,
  onEmploymentTypeRulesCsvChange,
  seniorityRulesCsv,
  onSeniorityRulesCsvChange,
  onSaveSelectionRules,
  rulesSaving,
  onHtmlChange,
  notice,
  saveError,
  canSave,
  saving,
  onSave,
  refetchTemplates,
}: {
  templates: TemplateRow[];
  activeTemplate: TemplateRow;
  hydrateKey: string;
  onTemplateChange: (templateId: string) => void;
  newTemplateName: string;
  onNewTemplateNameChange: (value: string) => void;
  onCreateTemplate: () => void;
  creatingTemplate: boolean;
  onMakeDefault: () => void;
  makingDefault: boolean;
  roleTitleRulesCsv: string;
  onRoleTitleRulesCsvChange: (value: string) => void;
  locationRulesCsv: string;
  onLocationRulesCsvChange: (value: string) => void;
  employmentTypeRulesCsv: string;
  onEmploymentTypeRulesCsvChange: (value: string) => void;
  seniorityRulesCsv: string;
  onSeniorityRulesCsvChange: (value: string) => void;
  onSaveSelectionRules: () => void;
  rulesSaving: boolean;
  onHtmlChange: (html: string) => void;
  notice: string | null;
  saveError: string | null;
  canSave: boolean;
  saving: boolean;
  onSave: () => void;
  refetchTemplates: (opts?: { silent?: boolean }) => Promise<void>;
}) {
  return (
    <>
      <div className="grid gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-3 lg:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-subtle)]">
            Select template
          </label>
          <select
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs font-medium text-[var(--text)]"
            style={{ colorScheme: "dark" }}
            value={activeTemplate.id}
            onChange={(e) => onTemplateChange(e.target.value)}
          >
            {templates.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name}
                {tpl.is_default ? " (default)" : ""} • v{tpl.latestVersionNumber}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <input
            value={newTemplateName}
            onChange={(e) => onNewTemplateNameChange(e.target.value)}
            placeholder="New template name"
            className="w-full min-w-[12rem] rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2 text-xs text-[var(--text)]"
          />
          <button
            type="button"
            onClick={onCreateTemplate}
            disabled={creatingTemplate}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
          >
            {creatingTemplate ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <span>
          Editing <span className="font-medium text-[var(--text)]">{activeTemplate.name}</span>
          {activeTemplate.is_default ? (
            <span className="ml-2 rounded-full border border-[var(--border)] px-2 py-0.5">
              Default
            </span>
          ) : null}
        </span>
        <div className="flex items-center gap-2">
          <span>Current version v{activeTemplate.latestVersionNumber}</span>
          {!activeTemplate.is_default ? (
            <button
              type="button"
              disabled={makingDefault}
              onClick={onMakeDefault}
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-100 transition hover:bg-amber-500/20 disabled:opacity-50"
            >
              {makingDefault ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} />}
              Make default
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2 lg:items-start">
        <div className="space-y-6">
          <OfferLetterMergeFieldsTable />
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/30 p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">Auto-assignment rules</h3>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Comma-separated values. Templates auto-select in offer draft when all filled criteria
              match. Recruiters can still override manually.
            </p>
            <div className="mt-3 space-y-2">
              <label className="block text-xs text-[var(--text-muted)]">
                Role title contains
                <input
                  value={roleTitleRulesCsv}
                  onChange={(e) => onRoleTitleRulesCsvChange(e.target.value)}
                  placeholder="e.g. engineer, developer, backend"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-2 text-xs text-[var(--text)]"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Locations
                <input
                  value={locationRulesCsv}
                  onChange={(e) => onLocationRulesCsvChange(e.target.value)}
                  placeholder="e.g. Bangalore, Mumbai, Remote"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-2 text-xs text-[var(--text)]"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Employment types
                <input
                  value={employmentTypeRulesCsv}
                  onChange={(e) => onEmploymentTypeRulesCsvChange(e.target.value)}
                  placeholder="e.g. full-time, contract"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-2 text-xs text-[var(--text)]"
                />
              </label>
              <label className="block text-xs text-[var(--text-muted)]">
                Seniority levels
                <input
                  value={seniorityRulesCsv}
                  onChange={(e) => onSeniorityRulesCsvChange(e.target.value)}
                  placeholder="e.g. junior, senior, lead"
                  className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)]/60 px-2.5 py-2 text-xs text-[var(--text)]"
                />
              </label>
            </div>
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={onSaveSelectionRules}
                disabled={rulesSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
              >
                {rulesSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save rules
              </button>
            </div>
          </div>
          <OfferLetterCustomMergeFieldsEditor
            templateId={activeTemplate.id}
            initialDefs={activeTemplate.customMergeFieldDefs ?? []}
            onSaved={() => void refetchTemplates({ silent: true })}
          />
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--text)]">Letter body</h3>
          <p className="mb-3 text-xs text-[var(--text-muted)]">
            Rich text for drafting; PDF output uses plain lines derived from this content.
          </p>
          <OfferLetterTemplateRichEditor
            key={activeTemplate.id}
            hydrateKey={hydrateKey}
            initialBody={activeTemplate.bodyText}
            onHtmlChange={onHtmlChange}
          />
        </div>
      </div>

      {notice ? (
        <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
          {notice}
        </p>
      ) : null}
      {saveError ? (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {saveError}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!canSave ? (
          <p className="text-xs text-[var(--text-muted)]">
            Add more content (plain text equivalent must be at least 20 characters).
          </p>
        ) : null}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || !canSave}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-sm font-medium text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save new version
        </button>
      </div>
    </>
  );
}
