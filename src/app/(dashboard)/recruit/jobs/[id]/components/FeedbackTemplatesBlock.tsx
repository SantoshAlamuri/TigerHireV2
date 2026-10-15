"use client";

import { useState } from "react";
import { FileText } from "lucide-react";

type FieldType = "rating" | "text";
type PresetKey = "general" | "technical" | "leadership";

type FeedbackField = {
  label: string;
  type: FieldType;
  required?: boolean;
  description?: string;
};

const PRESETS: Record<PresetKey, { label: string; defaultName: string; fields: FeedbackField[] }> =
  {
    general: {
      label: "General interview",
      defaultName: "General Interview Feedback",
      fields: [
        { label: "Role fit", type: "rating", required: true },
        { label: "Communication", type: "rating", required: true },
        { label: "Problem solving", type: "rating", required: true },
        { label: "Strengths", type: "text" },
        { label: "Risks / concerns", type: "text" },
      ],
    },
    technical: {
      label: "Technical interview",
      defaultName: "Technical Interview Feedback",
      fields: [
        { label: "Technical depth", type: "rating", required: true },
        { label: "System thinking", type: "rating", required: true },
        { label: "Code quality", type: "rating", required: true },
        { label: "Strengths", type: "text" },
        { label: "Gaps to close", type: "text" },
      ],
    },
    leadership: {
      label: "Leadership interview",
      defaultName: "Leadership Interview Feedback",
      fields: [
        { label: "Leadership maturity", type: "rating", required: true },
        { label: "Stakeholder management", type: "rating", required: true },
        { label: "Decision quality", type: "rating", required: true },
        { label: "Strengths", type: "text" },
        { label: "Risks / concerns", type: "text" },
      ],
    },
  };

export function FeedbackTemplatesBlock({
  jobId,
  templates,
  onSaved,
}: {
  jobId: string;
  templates: { id: string; name: string; fields: unknown[] }[];
  onSaved: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<PresetKey>("general");
  const [loading, setLoading] = useState(false);

  const addTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedPreset = PRESETS[preset];
    const templateName = name.trim() || selectedPreset.defaultName;
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/feedback-templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: templateName,
          fields: selectedPreset.fields,
        }),
        credentials: "include",
      });
      if (res.ok) {
        setName("");
        setPreset("general");
        setAdding(false);
        await onSaved();
      }
    } finally {
      setLoading(false);
    }
  };
  return (
    <div>
      <h3 className="heading-card mb-2 text-sm text-[var(--text)]">Feedback templates</h3>
      <ul className="space-y-1">
        {templates.map((t) => (
          <li key={t.id} className="flex items-center gap-2 text-sm text-white/60">
            <FileText size={14} />
            {t.name}
          </li>
        ))}
      </ul>
      {!adding ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline"
        >
          + Add template
        </button>
      ) : (
        <form onSubmit={addTemplate} className="mt-3 space-y-2">
          <p className="text-xs text-white/60">
            Quick setup: choose a preset and optionally rename it.
          </p>
          <label htmlFor="template-preset" className="text-xs text-white/60">
            Preset
          </label>
          <select
            id="template-preset"
            value={preset}
            onChange={(e) => setPreset(e.target.value as PresetKey)}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          >
            {(Object.keys(PRESETS) as PresetKey[]).map((key) => (
              <option key={key} value={key}>
                {PRESETS[key].label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={PRESETS[preset].defaultName}
            className="w-full rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1.5 text-sm"
          />
          <div className="rounded border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-white/60">
            Fields: {PRESETS[preset].fields.map((field) => field.label).join(", ")}
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="rounded border border-[var(--border)] px-3 py-1.5 text-xs"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
