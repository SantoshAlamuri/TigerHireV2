"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME } from "@/lib/feedback/ideal-profile-feedback-template";
import type { FeedbackTemplateField } from "@/types";

function coerceTemplateFields(raw: unknown): FeedbackTemplateField[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is FeedbackTemplateField => {
    if (!f || typeof f !== "object") return false;
    const o = f as Record<string, unknown>;
    return typeof o.label === "string" && typeof o.type === "string";
  });
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FeedbackTemplateField;
  value: string | number;
  onChange: (value: string | number) => void;
}) {
  const fieldId = `quick-field-${field.label.toLowerCase().replace(/\s+/g, "-")}`;
  // Legacy fields kept guidance in `description`; select kept its options there.
  const guidance = field.guidance ?? (field.type === "select" ? undefined : field.description);

  // rating (with an optional N-point scale) and yes_no share the same 1-based
  // index value semantics as the recruiter scorecard, so a value stored here
  // matches what that page reads. yes_no -> ["No","Yes"]; a scale -> its labels;
  // otherwise the legacy 1–5 stars.
  if (field.type === "rating" || field.type === "yes_no") {
    const numericValue = typeof value === "number" ? value : Number(value) || 0;
    const scale =
      field.type === "yes_no"
        ? ["No", "Yes"]
        : field.scale && field.scale.length >= 2
          ? field.scale
          : null;
    return (
      <div>
        <span className="mb-1 block text-xs text-white/60">
          {field.label}
          {field.required ? <span className="text-red-400">*</span> : null}
        </span>
        {guidance ? <p className="mb-1.5 text-xs text-white/60">{guidance}</p> : null}
        {scale ? (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={field.label}>
            {scale.map((label, i) => {
              const v = i + 1;
              const active = numericValue === v;
              return (
                <button
                  key={label}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => onChange(v)}
                  className={`rounded border px-2.5 py-1 text-xs transition ${
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-white/70"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex gap-1" role="group" aria-label={field.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange(n)}
                className={`flex h-8 w-8 items-center justify-center rounded ${numericValue === n ? "bg-[var(--accent)] text-black" : "bg-[var(--bg-elevated)] text-white/60"}`}
                title={`${n} of 5`}
                aria-label={`${n} of 5`}
              >
                <Star size={14} fill={numericValue >= n ? "currentColor" : "none"} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (field.type === "select") {
    const options =
      field.options && field.options.length > 0
        ? field.options
        : field.description
          ? field.description.split(",").map((o) => o.trim())
          : [];
    return (
      <div>
        <label htmlFor={fieldId} className="mb-1 block text-xs text-white/60">
          {field.label}
          {field.required ? <span className="text-red-400">*</span> : null}
        </label>
        <select
          id={fieldId}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
          required={field.required}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
        >
          <option value="">Select…</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (field.type === "number") {
    return (
      <div>
        <label htmlFor={fieldId} className="mb-1 block text-xs text-white/60">
          {field.label}
          {field.required ? <span className="text-red-400">*</span> : null}
        </label>
        <input
          id={fieldId}
          type="number"
          value={value === "" || value === 0 ? "" : value}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
          required={field.required}
          className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
        />
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-xs text-white/60">
        {field.label}
        {field.required ? <span className="text-red-400">*</span> : null}
      </label>
      {field.description ? <p className="mb-1 text-xs text-white/60">{field.description}</p> : null}
      <textarea
        id={fieldId}
        value={String(value)}
        onChange={(e) => onChange(e.target.value)}
        required={field.required}
        rows={2}
        className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-1.5 text-sm"
      />
    </div>
  );
}

export function FeedbackSubmitButton({
  jobId,
  pipelineCandidateId,
  candidateName,
  defaultTemplateId,
  templates,
  onSubmitted,
}: {
  jobId: string;
  pipelineCandidateId: string;
  candidateName: string;
  defaultTemplateId?: string;
  templates: { id: string; name: string; fields?: unknown[] }[];
  onSubmitted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [responses, setResponses] = useState<Record<string, string | number>>({});
  // Default UNSET — a rushed submit must not record a pre-filled "Hire / 3 stars"
  // the interviewer never chose. (#354)
  const [rating, setRating] = useState(0);
  const [recommendation, setRecommendation] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Local draft so a stray click/navigation can't wipe in-progress feedback. (#354)
  const draftKey = `feedback-draft:${jobId}:${pipelineCandidateId}`;

  const preferredTemplateId = useMemo(() => {
    if (defaultTemplateId && templates.some((t) => t.id === defaultTemplateId)) {
      return defaultTemplateId;
    }
    const ideal = templates.find((t) => t.name === IDEAL_PROFILE_FEEDBACK_TEMPLATE_NAME);
    return ideal?.id ?? templates[0]?.id ?? "";
  }, [templates, defaultTemplateId]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId],
  );

  const templateFields = useMemo(
    () => coerceTemplateFields(selectedTemplate?.fields),
    [selectedTemplate?.fields],
  );

  const openModal = () => {
    setLocalError(null);
    // Restore an in-progress draft if one exists; otherwise start empty/unset.
    let restored = false;
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(draftKey) : null;
      if (raw) {
        const d = JSON.parse(raw) as {
          templateId?: string;
          responses?: Record<string, string | number>;
          rating?: number;
          recommendation?: string;
          notes?: string;
        };
        setTemplateId(d.templateId || preferredTemplateId);
        setResponses(d.responses ?? {});
        setRating(typeof d.rating === "number" ? d.rating : 0);
        setRecommendation(d.recommendation ?? "");
        setNotes(d.notes ?? "");
        restored = true;
      }
    } catch {
      /* ignore malformed draft */
    }
    if (!restored) {
      setTemplateId(preferredTemplateId);
      setResponses({});
      setRating(0);
      setRecommendation("");
      setNotes("");
    }
    setOpen(true);
  };

  const clearDraft = () => {
    try {
      if (typeof window !== "undefined") window.localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  };

  const isDirty =
    rating > 0 || recommendation !== "" || notes.trim() !== "" || Object.keys(responses).length > 0;

  // Persist the draft whenever the open form changes.
  useEffect(() => {
    if (!open) return;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(
          draftKey,
          JSON.stringify({ templateId, responses, rating, recommendation, notes }),
        );
      }
    } catch {
      /* ignore quota errors */
    }
  }, [open, draftKey, templateId, responses, rating, recommendation, notes]);

  const requestClose = () => {
    if (
      isDirty &&
      !window.confirm("Discard your feedback? Your draft will be kept on this device.")
    )
      return;
    setOpen(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) return;
    setLocalError(null);

    for (const f of templateFields) {
      if (!f.required) continue;
      const v = responses[f.label];
      if (f.type === "rating" || f.type === "yes_no") {
        // Scale/yes_no store a 1-based index; don't cap at 5 — a 6–7 point scale
        // must be submittable.
        const n = typeof v === "number" ? v : Number(v);
        if (!n || n < 1) {
          setLocalError(`Please rate: ${f.label}`);
          return;
        }
      } else if (v === undefined || v === "" || v === null) {
        setLocalError(`Please complete: ${f.label}`);
        return;
      }
    }

    if (!recommendation) {
      setLocalError("Please choose a recommendation.");
      return;
    }
    // "Can't assess" is the dispute path — no overall rating needed.
    if (recommendation !== "cannot_assess" && rating < 1) {
      setLocalError("Overall rating is required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: templateId,
          pipeline_candidate_id: pipelineCandidateId,
          responses,
          overall_rating: recommendation === "cannot_assess" ? undefined : rating,
          recommendation,
          notes: notes.trim() || undefined,
        }),
        credentials: "include",
      });
      if (res.ok) {
        clearDraft();
        setOpen(false);
        await onSubmitted();
      } else {
        const j = (await res.json().catch(() => null)) as { error?: string } | null;
        setLocalError(j?.error ?? "Submit failed");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={templates.length === 0}
        title={
          templates.length === 0
            ? "No feedback form yet. Save the Ideal Candidate Profile on the job to generate one."
            : undefined
        }
        className="rounded px-2 py-1 text-xs font-medium text-[var(--text)] hover:bg-[var(--accent)]/15 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Submit feedback
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={requestClose}
        >
          <form
            onSubmit={submit}
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="heading-card text-sm text-[var(--text)]">
              Submit feedback — {candidateName}
            </h4>
            <div className="mt-3 space-y-3">
              <label htmlFor="feedback-template-quick" className="block text-xs text-white/60">
                Template
              </label>
              <select
                id="feedback-template-quick"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setResponses({});
                  setLocalError(null);
                }}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                required
                aria-label="Feedback template"
              >
                <option value="">Select</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>

              {templateFields.map((field) => (
                <FieldInput
                  key={field.label}
                  field={field}
                  value={responses[field.label] ?? (field.type === "rating" ? 0 : "")}
                  onChange={(v) =>
                    setResponses((prev) => ({
                      ...prev,
                      [field.label]: v,
                    }))
                  }
                />
              ))}

              <label className="block text-xs text-white/60">Overall rating (1–5)</label>
              <div className="flex gap-2" role="group" aria-label="Rating 1 to 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(n)}
                    className={`flex h-8 w-8 items-center justify-center rounded ${rating === n ? "bg-[var(--accent)] text-black" : "bg-[var(--bg-elevated)] text-white/60"}`}
                    title={`Rate ${n} star${n === 1 ? "" : "s"}`}
                    aria-label={`Rate ${n} star${n === 1 ? "" : "s"}`}
                  >
                    <Star size={14} fill={rating >= n ? "currentColor" : "none"} />
                  </button>
                ))}
              </div>
              <label
                htmlFor="feedback-recommendation-quick"
                className="block text-xs text-white/60"
              >
                Recommendation
              </label>
              <select
                id="feedback-recommendation-quick"
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                aria-label="Recommendation"
              >
                <option value="">Select…</option>
                <option value="strong_hire">Strong hire</option>
                <option value="hire">Hire</option>
                <option value="no_hire">No hire</option>
                <option value="strong_no_hire">Strong no hire</option>
                <option value="cannot_assess">Can&apos;t assess (wrong candidate / no data)</option>
              </select>
              <label htmlFor="feedback-notes-quick" className="block text-xs text-white/60">
                Notes
              </label>
              <textarea
                id="feedback-notes-quick"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm"
                rows={2}
              />
              {localError ? <p className="text-xs text-red-400">{localError}</p> : null}
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={loading}
                className="rounded bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                Submit
              </button>
              <button
                type="button"
                onClick={requestClose}
                className="rounded border border-[var(--border)] px-4 py-2 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
