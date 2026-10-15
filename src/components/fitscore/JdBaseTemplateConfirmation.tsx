"use client";

import { useCallback, useEffect, useState } from "react";

type TemplateOption = { id: string; category: string; roleTitle: string };

function storageKey(jobId: string) {
  return `tigerhire_jd_preset_ok_${jobId}`;
}

function readAck(jobId: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(storageKey(jobId));
}

export interface JdBaseTemplateConfirmationProps {
  jobId: string;
  scoringFoundation: "india_template" | "llm";
  indiaTemplateId: string | null;
  indiaTemplateCategory: string | null;
  indiaTemplateRoleTitle: string | null;
  /** Called after a new preset is applied so the parent can refetch JD Base. */
  onApplied: () => void;
  /** `true` while scoring approval should stay disabled (library preset not confirmed yet). */
  onBlockingChange?: (blocksApproval: boolean) => void;
}

export function JdBaseTemplateConfirmation({
  jobId,
  scoringFoundation,
  indiaTemplateId,
  indiaTemplateCategory,
  indiaTemplateRoleTitle,
  onApplied,
  onBlockingChange,
}: JdBaseTemplateConfirmationProps) {
  const [confirmedId, setConfirmedId] = useState<string | null>(() => readAck(jobId));
  const [showPicker, setShowPicker] = useState(false);
  const [templates, setTemplates] = useState<TemplateOption[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    setConfirmedId(readAck(jobId));
  }, [jobId, indiaTemplateId]);

  const blocksApproval =
    scoringFoundation === "india_template" &&
    Boolean(indiaTemplateId) &&
    confirmedId !== indiaTemplateId;

  useEffect(() => {
    onBlockingChange?.(blocksApproval);
  }, [blocksApproval, onBlockingChange]);

  const loadTemplates = useCallback(async () => {
    setTemplatesError(null);
    try {
      const res = await fetch("/api/fitscore/jd-base/templates", { credentials: "include" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTemplatesError(typeof body.error === "string" ? body.error : "Could not load presets");
        return;
      }
      const list = (body.data?.templates ?? body.templates) as TemplateOption[] | undefined;
      setTemplates(Array.isArray(list) ? list : []);
    } catch {
      setTemplatesError("Network error loading presets");
    }
  }, []);

  useEffect(() => {
    if (showPicker && templates === null && !templatesError) {
      void loadTemplates();
    }
  }, [showPicker, templates, templatesError, loadTemplates]);

  const confirmPreset = useCallback(() => {
    if (!indiaTemplateId) return;
    if (typeof window !== "undefined") {
      localStorage.setItem(storageKey(jobId), indiaTemplateId);
    }
    setConfirmedId(indiaTemplateId);
    setShowPicker(false);
    setApplyError(null);
  }, [jobId, indiaTemplateId]);

  const applySelected = useCallback(async () => {
    if (!selectedId) {
      setApplyError("Choose a preset from the list.");
      return;
    }
    setApplying(true);
    setApplyError(null);
    try {
      const res = await fetch("/api/fitscore/jd-base/from-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ jobId, templateId: selectedId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApplyError(typeof body.error === "string" ? body.error : "Could not apply preset");
        return;
      }
      if (typeof window !== "undefined") {
        localStorage.removeItem(storageKey(jobId));
      }
      setConfirmedId(null);
      setShowPicker(false);
      onApplied();
    } catch {
      setApplyError("Network error");
    } finally {
      setApplying(false);
    }
  }, [jobId, selectedId, onApplied]);

  const presetLabel =
    indiaTemplateCategory && indiaTemplateRoleTitle
      ? `${indiaTemplateRoleTitle} · ${indiaTemplateCategory}`
      : (indiaTemplateRoleTitle ?? indiaTemplateId ?? "Library preset");

  if (scoringFoundation === "india_template" && indiaTemplateId && !blocksApproval) {
    return (
      <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            <span className="font-medium text-zinc-800 dark:text-zinc-200">Role preset</span>
            <span className="text-zinc-500 dark:text-zinc-400"> — {presetLabel}</span>
            <span className="ml-2 text-emerald-600 dark:text-emerald-400">Confirmed</span>
          </p>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") localStorage.removeItem(storageKey(jobId));
              setConfirmedId(null);
              setShowPicker(true);
              setSelectedId(indiaTemplateId);
            }}
            className="text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Change preset
          </button>
        </div>
      </div>
    );
  }

  if (scoringFoundation === "india_template" && indiaTemplateId && blocksApproval) {
    return (
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-900 dark:bg-amber-950/40">
        <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
          Confirm role preset
        </p>
        <p className="mt-1 text-sm text-amber-800/90 dark:text-amber-200/90">
          We matched this job to the library preset{" "}
          <span className="font-semibold">{presetLabel}</span>. If that is not right for this role,
          pick another preset — scoring dimensions and ideal profile will update.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={confirmPreset}
            className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950 dark:bg-amber-700 dark:hover:bg-amber-600"
          >
            Yes, this preset fits
          </button>
          <button
            type="button"
            onClick={() => {
              setShowPicker(true);
              setSelectedId(indiaTemplateId);
              void loadTemplates();
            }}
            className="rounded-lg border border-amber-800/40 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-zinc-900 dark:text-amber-100 dark:hover:bg-zinc-800"
          >
            No — choose a different preset
          </button>
        </div>

        {showPicker && (
          <div className="mt-4 space-y-3 rounded-md border border-amber-200/80 bg-white p-3 dark:border-amber-800 dark:bg-zinc-950">
            <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Preset library (121 roles)
              <select
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
                disabled={applying}
              >
                <option value="">Select…</option>
                {(templates ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.category} — {t.roleTitle}
                  </option>
                ))}
              </select>
            </label>
            {templates === null && !templatesError && (
              <p className="text-xs text-zinc-500">Loading presets…</p>
            )}
            {templatesError && (
              <p className="text-xs text-red-600 dark:text-red-400">{templatesError}</p>
            )}
            {applyError && <p className="text-xs text-red-600 dark:text-red-400">{applyError}</p>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={applying || !selectedId}
                onClick={() => void applySelected()}
                className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {applying ? "Applying…" : "Apply preset"}
              </button>
              <button
                type="button"
                disabled={applying}
                onClick={() => setShowPicker(false)}
                className="text-sm text-zinc-600 underline dark:text-zinc-400"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* LLM-generated foundation — optional switch to a preset */
  return (
    <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-900/80">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">
        <span className="font-medium text-zinc-800 dark:text-zinc-200">Scoring dimensions</span>
        <span className="text-zinc-500 dark:text-zinc-400">
          {" "}
          were generated from your job description (no library preset). You can still apply a preset
          if you prefer standard dimensions for a role family.
        </span>
      </p>
      {!showPicker ? (
        <button
          type="button"
          onClick={() => {
            setShowPicker(true);
            setSelectedId("");
            void loadTemplates();
          }}
          className="mt-2 text-xs font-medium text-zinc-600 underline underline-offset-2 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
        >
          Use a preset instead
        </button>
      ) : (
        <div className="mt-3 space-y-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-600 dark:bg-zinc-950">
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Choose preset
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
              disabled={applying}
            >
              <option value="">Select…</option>
              {(templates ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.category} — {t.roleTitle}
                </option>
              ))}
            </select>
          </label>
          {templates === null && !templatesError && (
            <p className="text-xs text-zinc-500">Loading presets…</p>
          )}
          {templatesError && (
            <p className="text-xs text-red-600 dark:text-red-400">{templatesError}</p>
          )}
          {applyError && <p className="text-xs text-red-600 dark:text-red-400">{applyError}</p>}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={applying || !selectedId}
              onClick={() => void applySelected()}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              {applying ? "Applying…" : "Apply preset"}
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => setShowPicker(false)}
              className="text-sm text-zinc-600 underline dark:text-zinc-400"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
