"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Loader2,
  Plus,
  FileText,
  Save,
  Trash2,
  Pencil,
  GripVertical,
  Target,
  Sparkles,
} from "lucide-react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { Skeleton } from "@/components/ui/Skeleton";
import { AutoScoringSetup } from "./AutoScoringSetup";
import {
  type ScorecardField,
  type RatingTone,
  RATING_SCALE_4,
  GREENHOUSE_SCORECARD_PRESET,
  SCORECARD_GROUP_SUGGESTIONS,
  FEEDBACK_TYPE_OPTIONS,
  COMPETENCY_SUGGESTIONS,
  feedbackTypeIdOf,
  applyFeedbackType,
  ratingToneAt,
} from "@/lib/feedback/scorecard";

interface FeedbackTemplate {
  id: string;
  name: string;
  fields: ScorecardField[];
}

type PresetKey = "greenhouse" | "technical" | "leadership";

function rating(label: string, group: string, required = false): ScorecardField {
  return { label, type: "rating", group, scale: [...RATING_SCALE_4], required };
}

const TEMPLATE_PRESETS: Record<
  PresetKey,
  { label: string; defaultName: string; fields: ScorecardField[] }
> = {
  greenhouse: { label: "Standard scorecard", ...GREENHOUSE_SCORECARD_PRESET },
  technical: {
    label: "Technical interview",
    defaultName: "Technical Interview Scorecard",
    fields: [
      rating("Technical depth", "Focus area", true),
      rating("System design", "Focus area", true),
      rating("Code quality", "Focus area"),
      rating("Communication", "Other"),
      { label: "Strengths", type: "text", group: "Other" },
      { label: "Gaps to close", type: "text", group: "Other" },
    ],
  },
  leadership: {
    label: "Leadership interview",
    defaultName: "Leadership Interview Scorecard",
    fields: [
      rating("Leadership maturity", "Focus area", true),
      rating("Stakeholder management", "Focus area"),
      rating("Decision quality", "Focus area"),
      rating("Culture & values add", "Other"),
      { label: "Strengths", type: "text", group: "Other" },
      { label: "Risks / concerns", type: "text", group: "Other" },
    ],
  },
};

function emptyField(): ScorecardField {
  return { label: "", type: "rating", group: "Focus area", scale: [...RATING_SCALE_4] };
}

/** Static preview-chip colours by sentiment tone (worst → best). */
const PREVIEW_TONE_CLASSES: Record<RatingTone, string> = {
  neg: "border-red-500/30 bg-red-500/10 text-red-300",
  warn: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  mid: "border-white/20 bg-white/5 text-white/70",
  pos: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  strongpos: "border-teal-400/30 bg-teal-400/10 text-teal-100",
};

/** Competencies offered as one-click "quick add" chips. */
const QUICK_ADD = [
  "Problem solving",
  "System design",
  "Technical depth",
  "Communication",
  "Ownership & drive",
  "Culture & values add",
] as const;

function competencyCount(fields: ScorecardField[]): string {
  const groups = new Set(fields.map((f) => f.group?.trim() || "Focus area"));
  return `${groups.size} categor${groups.size === 1 ? "y" : "ies"}`;
}

function TemplateModal({
  jobId,
  template,
  onClose,
  onSaved,
}: {
  jobId: string;
  template: FeedbackTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = Boolean(template);
  const [name, setName] = useState(template?.name ?? "");
  const [fields, setFields] = useState<ScorecardField[]>(
    template?.fields?.length ? template.fields.map((f) => ({ ...f })) : [emptyField()],
  );
  const [preset, setPreset] = useState<PresetKey>("greenhouse");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedOptions, setExpandedOptions] = useState<Set<number>>(new Set());
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const toggleOptions = (index: number) =>
    setExpandedOptions((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const updateField = (index: number, updates: Partial<ScorecardField>) =>
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  const removeField = (index: number) => setFields((prev) => prev.filter((_, i) => i !== index));
  const reorder = (from: number, to: number) =>
    setFields((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length)
        return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  const addCompetency = (label = "") => setFields((prev) => [...prev, { ...emptyField(), label }]);

  const applyPreset = () => {
    const p = TEMPLATE_PRESETS[preset];
    setName((prev) => prev || p.defaultName);
    setFields(p.fields.map((f) => ({ ...f })));
  };

  const [generating, setGenerating] = useState(false);
  const handleGenerateFromRubric = async () => {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/feedback-templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        fields?: ScorecardField[];
        suggestedName?: string;
        error?: string;
      };
      if (!res.ok || !data.fields?.length) {
        setError(data.error ?? "Couldn't generate competencies from the rubric.");
        return;
      }
      setFields(data.fields.map((f) => ({ ...f })));
      setName((prev) => prev || data.suggestedName || "Interview Scorecard");
    } catch {
      setError("Network error while generating. Please retry.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleaned: ScorecardField[] = fields
      .filter((f) => f.label.trim())
      .map((f) => {
        const out: ScorecardField = {
          label: f.label.trim(),
          type: f.type,
          group: f.group ?? "Focus area",
        };
        if (f.guidance?.trim()) out.guidance = f.guidance.trim();
        if (f.required) out.required = true;
        if (f.type === "select" && f.options?.length) out.options = f.options;
        if (f.type === "rating") out.scale = f.scale?.length ? f.scale : [...RATING_SCALE_4];
        return out;
      });
    if (cleaned.length === 0) {
      setError("Add at least one competency with a label.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        isEdit
          ? `/api/jobs/${jobId}/feedback-templates/${template!.id}`
          : `/api/jobs/${jobId}/feedback-templates`,
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ name: name.trim() || "Interview Scorecard", fields: cleaned }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Failed to save scorecard. Please retry.");
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="heading-section mb-4 flex items-center gap-2 text-base text-[var(--text)]">
          <FileText size={20} className="text-[var(--accent)]" />
          {isEdit ? "Edit scorecard" : "Create scorecard"}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isEdit ? (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleGenerateFromRubric}
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-2.5 text-sm font-medium text-[var(--accent)] transition hover:bg-[var(--accent)]/15 disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Sparkles size={15} />
                )}
                Generate competencies from this role&apos;s rubric
              </button>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1.5 block text-sm text-white/60">
                    Or start from a preset
                  </label>
                  <select
                    value={preset}
                    onChange={(e) => setPreset(e.target.value as PresetKey)}
                    className="w-full card-lifted px-4 py-2.5 text-sm text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-white/20"
                  >
                    {(Object.keys(TEMPLATE_PRESETS) as PresetKey[]).map((k) => (
                      <option key={k} value={k}>
                        {TEMPLATE_PRESETS[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={applyPreset}
                  className="shrink-0 rounded-full border border-[var(--accent)]/40 px-4 py-2.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/10"
                >
                  Use preset
                </button>
              </div>
            </div>
          ) : null}

          <div>
            <label htmlFor="tpl-name" className="mb-1.5 block text-sm text-white/60">
              Scorecard name
            </label>
            <input
              id="tpl-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Onsite — System Design"
              className="w-full card-lifted px-4 py-2.5 text-sm text-[var(--text)] placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-white/20"
              required
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-sm text-white/60">Competencies</label>
              <span className="text-[11px] text-white/30">drag the grip to reorder</span>
            </div>
            <p className="mb-2 text-[11px] text-white/35">
              Name what to assess, then pick how interviewers score it. The scales are prebuilt.
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-white/35">Quick add:</span>
              {QUICK_ADD.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => addCompetency(c)}
                  className="rounded-full border border-[var(--border)] px-2.5 py-0.5 text-[11px] text-white/70 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                >
                  + {c}
                </button>
              ))}
            </div>
            <datalist id="scorecard-group-suggestions">
              {SCORECARD_GROUP_SUGGESTIONS.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <datalist id="competency-suggestions">
              {COMPETENCY_SUGGESTIONS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="space-y-2.5">
              {fields.map((field, index) => {
                const activeType = feedbackTypeIdOf(field);
                const previewChips =
                  field.type === "yes_no"
                    ? ["No", "Yes"]
                    : field.type === "rating"
                      ? (field.scale ?? RATING_SCALE_4).filter(Boolean)
                      : null;
                return (
                  <div
                    key={index}
                    onDragOver={(e) => {
                      if (dragIndex !== null) e.preventDefault();
                    }}
                    onDrop={() => {
                      if (dragIndex !== null) reorder(dragIndex, index);
                      setDragIndex(null);
                    }}
                    className={`card-lifted space-y-2.5 p-3 transition ${
                      dragIndex === index ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragEnd={() => setDragIndex(null)}
                        className="shrink-0 cursor-grab text-white/25 transition hover:text-white/55 active:cursor-grabbing"
                        aria-label="Drag to reorder"
                      >
                        <GripVertical size={16} />
                      </span>
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[10px] font-medium text-white/45">
                        {index + 1}
                      </span>
                      <input
                        list="competency-suggestions"
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="Competency (e.g. Problem solving)"
                        className="min-w-0 flex-1 card-lifted px-3 py-2 text-sm text-[var(--text)] placeholder:text-white/50 focus:outline-none focus:ring-1 focus:ring-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => removeField(index)}
                        disabled={fields.length <= 1}
                        className="shrink-0 rounded p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-25"
                        aria-label="Remove competency"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pl-7">
                      {FEEDBACK_TYPE_OPTIONS.map((o) => {
                        const active = o.id === activeType;
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() => updateField(index, applyFeedbackType(o.id))}
                            className={`rounded-full border px-3 py-1 text-xs transition ${
                              active
                                ? "border-[var(--accent)] bg-[var(--accent)]/15 font-medium text-[var(--accent)]"
                                : "border-[var(--border)] text-white/60 hover:bg-white/5 hover:text-white/80"
                            }`}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pl-7">
                      {previewChips ? (
                        <>
                          {previewChips.map((s, i) => (
                            <span
                              key={i}
                              className={`rounded-md border px-2 py-0.5 text-[11px] ${
                                PREVIEW_TONE_CLASSES[ratingToneAt(i, previewChips.length)]
                              }`}
                            >
                              {s}
                            </span>
                          ))}
                          <span className="text-[11px] text-white/30">interviewers pick one</span>
                        </>
                      ) : (
                        <span className="text-[11px] text-white/30">
                          Interviewers write a free-text answer
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleOptions(index)}
                      className="ml-7 text-[11px] font-medium text-white/40 hover:text-white/70"
                    >
                      {expandedOptions.has(index)
                        ? "− Hide options"
                        : "+ Category & interviewer guidance"}
                    </button>
                    {expandedOptions.has(index) ? (
                      <div className="ml-7 space-y-2 border-t border-[var(--border)]/60 pt-2">
                        <div className="flex flex-wrap items-center gap-3">
                          <input
                            list="scorecard-group-suggestions"
                            value={field.group ?? "Focus area"}
                            onChange={(e) => updateField(index, { group: e.target.value })}
                            placeholder="Category"
                            className="card-lifted px-3 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-white/20"
                            aria-label="Category"
                          />
                          <label className="flex items-center gap-2 text-xs text-white/70">
                            <input
                              type="checkbox"
                              checked={Boolean(field.required)}
                              onChange={(e) => updateField(index, { required: e.target.checked })}
                              className="size-4 accent-[var(--accent)]"
                            />
                            Required
                          </label>
                        </div>
                        <textarea
                          value={field.guidance ?? ""}
                          onChange={(e) => updateField(index, { guidance: e.target.value })}
                          placeholder="Interviewer guidance (optional) — what 'good' looks like"
                          rows={2}
                          className="w-full card-lifted px-3 py-2 text-xs text-white/80 placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => addCompetency()}
              className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] py-2 text-sm font-medium text-white/60 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              <Plus size={15} /> Add competency
            </button>
          </div>

          {error ? (
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {isEdit ? "Save changes" : "Create scorecard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function FeedbackTemplatesPage() {
  const params = useParams();
  const id = params.id as string;

  const { data: jobData } = useApiQuery<{ job: { title: string } }>(id ? `/api/jobs/${id}` : null);
  const {
    data: templatesData,
    loading,
    error,
    refetch,
  } = useApiQuery<{ templates: FeedbackTemplate[] }>(
    id ? `/api/jobs/${id}/feedback-templates` : null,
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackTemplate | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const jobTitle = jobData?.job?.title ?? "Job";
  const templates = templatesData?.templates ?? [];

  const flash = (m: string) => {
    setMessage(m);
    setTimeout(() => setMessage(null), 3000);
  };

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (t: FeedbackTemplate) => {
    setEditing(t);
    setModalOpen(true);
  };

  const handleDelete = async (t: FeedbackTemplate) => {
    if (!window.confirm(`Delete scorecard "${t.name}"? This cannot be undone.`)) return;
    setDeletingId(t.id);
    try {
      const res = await fetch(`/api/jobs/${id}/feedback-templates/${t.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        flash("Scorecard deleted.");
        refetch();
      }
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <h2 className="heading-section text-lg text-[var(--text)]">Interview scorecards</h2>
          <p className="mt-1 text-sm text-white/60">
            {jobTitle} — competencies interviewers rate, attached to pipeline stages.
          </p>
        </div>

        {!loading ? (
          <AutoScoringSetup
            jobId={id}
            hasScorecard={templates.length > 0}
            onCreated={() => {
              refetch();
              flash("Scoring setup drafted.");
            }}
          />
        ) : null}

        {message ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-400">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-400">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4 py-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card-lifted space-y-3 p-6">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="heading-section text-base text-[var(--text)]">Scorecards</h3>
              <button
                type="button"
                onClick={openCreate}
                className="flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                <Plus size={16} /> New scorecard
              </button>
            </div>

            {templates.length === 0 ? (
              <div className="card-lifted p-12 text-center">
                <FileText size={40} className="mx-auto mb-3 text-white/60" />
                <p className="text-white/60">No scorecards yet.</p>
                <button
                  type="button"
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-6 py-2.5 text-sm font-semibold text-black"
                >
                  <Plus size={16} /> Create scorecard
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map((t) => (
                  <div key={t.id} className="card-lifted p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-2">
                          <Target size={18} className="text-[var(--accent)]" />
                        </div>
                        <div>
                          <h4 className="text-sm font-semibold text-[var(--text)]">{t.name}</h4>
                          <p className="mt-1 text-sm text-white/55">
                            {t.fields?.length ?? 0} competenc
                            {(t.fields?.length ?? 0) === 1 ? "y" : "ies"}
                            {(t.fields?.length ?? 0) > 0
                              ? ` · ${competencyCount(t.fields ?? [])}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEdit(t)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-white/[0.04]"
                        >
                          <Pencil size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t)}
                          disabled={deletingId === t.id}
                          className="rounded-md p-1.5 text-red-400 hover:bg-red-500/10 disabled:opacity-40"
                          aria-label="Delete scorecard"
                        >
                          {deletingId === t.id ? (
                            <Loader2 size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {modalOpen ? (
        <TemplateModal
          jobId={id}
          template={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            refetch();
            flash(editing ? "Scorecard updated." : "Scorecard created.");
          }}
        />
      ) : null}
    </>
  );
}
