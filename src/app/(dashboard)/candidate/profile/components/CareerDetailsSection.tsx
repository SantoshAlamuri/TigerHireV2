"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Save, Loader2, RotateCcw } from "lucide-react";
import { useApiQuery, invalidateQueries } from "@/lib/hooks/use-api";
import {
  careerProfileSchema,
  emptyCareerProfile,
  type CareerProfile,
  type CareerProfileRecord,
} from "@/lib/candidate/career-profile";

const inputClass =
  "w-full min-w-0 rounded-md border border-white/15 bg-white/[0.04] px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]";
const buttonClass =
  "inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2 text-sm text-white/80 hover:bg-white/[0.06] disabled:opacity-50";
type Field<T> = {
  key: keyof T;
  label: string;
  type?: "text" | "textarea" | "month" | "checkbox" | "url" | "select";
  options?: { value: string; label: string }[];
  maxLength?: number;
};

function Entries<T extends { id: string }>({
  title,
  singular,
  entries,
  fields,
  onChange,
  create,
  limit,
}: {
  title: string;
  singular: string;
  entries: T[];
  fields: Field<T>[];
  onChange: (entries: T[]) => void;
  create: () => T;
  limit: number;
}) {
  return (
    <section className="space-y-4 border-t border-white/10 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">
          {title} <span className="ml-1 text-sm font-normal text-white/50">{entries.length}</span>
        </h3>
        <button
          type="button"
          className={buttonClass}
          disabled={entries.length >= limit}
          onClick={() => onChange([...entries, create()])}
        >
          <Plus size={16} /> Add {singular}
        </button>
      </div>
      {entries.length === 0 && (
        <p className="text-sm text-white/55">No {title.toLowerCase()} added.</p>
      )}
      {entries.map((entry, index) => (
        <fieldset key={entry.id} className="min-w-0 rounded-lg border border-white/10 p-4">
          <legend className="px-1 text-sm text-white/65">
            {singular} {index + 1}
          </legend>
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              className={buttonClass}
              aria-label={`Remove ${singular.toLowerCase()} ${index + 1}`}
              title={`Remove ${singular.toLowerCase()}`}
              onClick={() => onChange(entries.filter((item) => item.id !== entry.id))}
            >
              <Trash2 size={15} />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => {
              const id = `${entry.id}-${String(field.key)}`;
              const value = entry[field.key];
              const update = (next: string | boolean) =>
                onChange(
                  entries.map((item) =>
                    item.id === entry.id
                      ? {
                          ...item,
                          [field.key]: next,
                          ...(field.key === "current" && next === true ? { endDate: "" } : {}),
                        }
                      : item,
                  ),
                );
              const disabled =
                field.key === "endDate" && "current" in entry && Boolean(entry.current);
              return (
                <div
                  key={String(field.key)}
                  className={field.type === "textarea" ? "sm:col-span-2" : "min-w-0"}
                >
                  {field.type === "checkbox" ? (
                    <label
                      className="flex min-h-10 items-center gap-2 text-sm text-white/75"
                      htmlFor={id}
                    >
                      <input
                        id={id}
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(event) => update(event.target.checked)}
                      />
                      {field.label}
                    </label>
                  ) : (
                    <>
                      <label htmlFor={id} className="mb-1.5 block text-sm text-white/65">
                        {field.label}
                      </label>
                      {field.type === "textarea" ? (
                        <textarea
                          id={id}
                          rows={3}
                          className={inputClass}
                          maxLength={field.maxLength ?? 4000}
                          value={String(value)}
                          onChange={(event) => update(event.target.value)}
                        />
                      ) : field.type === "select" ? (
                        <select
                          id={id}
                          className={inputClass}
                          value={String(value)}
                          onChange={(event) => update(event.target.value)}
                        >
                          {field.options?.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          id={id}
                          className={inputClass}
                          type={field.type ?? "text"}
                          disabled={disabled}
                          maxLength={field.type === "url" ? 1000 : 200}
                          value={String(value)}
                          onChange={(event) => update(event.target.value)}
                        />
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
    </section>
  );
}

export function CareerDetailsSection({ candidateId }: { candidateId: string | null }) {
  const { data, loading, error, refetch } = useApiQuery<{ career: CareerProfileRecord | null }>(
    "/api/candidates/me/career",
  );
  const [document, setDocument] = useState<CareerProfile>(emptyCareerProfile);
  const [savedDocument, setSavedDocument] = useState<CareerProfile>(emptyCareerProfile);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const hydrated = useRef(false);
  const dirty = JSON.stringify(document) !== JSON.stringify(savedDocument);

  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const next = data.career?.document ?? emptyCareerProfile();
    setDocument(next);
    setSavedDocument(next);
    setUpdatedAt(data.career?.updated_at ?? null);
  }, [data]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change<K extends keyof CareerProfile>(key: K, value: CareerProfile[K]) {
    setDocument((previous) => ({ ...previous, [key]: value }));
    setMessage(null);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    setSaveError(null);
    const parsed = careerProfileSchema.safeParse(document);
    if (!parsed.success) {
      setSaveError(
        parsed.error.issues
          .map((issue) => `${issue.path.join(" > ")}: ${issue.message}`)
          .join(". "),
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/candidates/me/career", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ document: parsed.data, expectedUpdatedAt: updatedAt }),
      });
      const result = await response.json();
      if (!response.ok) {
        setConflict(response.status === 409);
        throw new Error(result.error ?? "Could not save career details");
      }
      setDocument(result.career.document);
      setSavedDocument(result.career.document);
      setUpdatedAt(result.career.updated_at);
      setMessage("Career details saved");
      invalidateQueries("/api/candidates/me/career");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save career details");
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return (
      <p className="py-8 text-sm text-white/65" role="status">
        Loading career details...
      </p>
    );
  if (error)
    return (
      <div className="py-8">
        <p role="alert" className="mb-3 text-sm text-rose-300">
          {error}
        </p>
        <button className={buttonClass} onClick={() => void refetch()}>
          Retry
        </button>
      </div>
    );

  return (
    <form onSubmit={save} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3 py-4">
        <h2 className="text-lg font-semibold text-white">Career details</h2>
        <span className="text-xs text-white/55">Private to you</span>
      </div>
      {!candidateId && (
        <p className="text-sm text-amber-300">
          Save your personal details before adding your career history.
        </p>
      )}
      <fieldset disabled={saving || !candidateId} className="min-w-0">
        <label htmlFor="career-summary" className="mb-2 block text-sm text-white/65">
          Professional summary
        </label>
        <textarea
          id="career-summary"
          rows={4}
          maxLength={3000}
          className={inputClass}
          value={document.summary}
          onChange={(event) => change("summary", event.target.value)}
        />
        <Entries
          title="Work history"
          singular="Role"
          entries={document.experience}
          limit={30}
          onChange={(value) => change("experience", value)}
          create={() => ({
            id: crypto.randomUUID(),
            role: "",
            company: "",
            location: "",
            startDate: "",
            endDate: "",
            current: false,
            highlights: "",
          })}
          fields={[
            { key: "role", label: "Role" },
            { key: "company", label: "Company" },
            { key: "location", label: "Location" },
            { key: "current", label: "I currently work here", type: "checkbox" },
            { key: "startDate", label: "Start date", type: "month" },
            { key: "endDate", label: "End date", type: "month" },
            { key: "highlights", label: "Responsibilities and results", type: "textarea" },
          ]}
        />
        <Entries
          title="Education"
          singular="Education"
          entries={document.education}
          limit={20}
          onChange={(value) => change("education", value)}
          create={() => ({
            id: crypto.randomUUID(),
            institution: "",
            qualification: "",
            field: "",
            startYear: "",
            endYear: "",
          })}
          fields={[
            { key: "institution", label: "Institution" },
            { key: "qualification", label: "Degree or qualification" },
            { key: "field", label: "Field of study" },
            { key: "startYear", label: "Start year" },
            { key: "endYear", label: "End year" },
          ]}
        />
        <Entries
          title="Achievements"
          singular="Achievement"
          entries={document.achievements}
          limit={30}
          onChange={(value) => change("achievements", value)}
          create={() => ({
            id: crypto.randomUUID(),
            title: "",
            context: "",
            outcome: "",
            evidenceUrl: "",
          })}
          fields={[
            { key: "title", label: "Achievement" },
            { key: "outcome", label: "Outcome" },
            {
              key: "context",
              label: "Context and your contribution",
              type: "textarea",
              maxLength: 1000,
            },
            { key: "evidenceUrl", label: "Evidence link", type: "url" },
          ]}
        />
        <Entries
          title="Certifications"
          singular="Certification"
          entries={document.certifications}
          limit={30}
          onChange={(value) => change("certifications", value)}
          create={() => ({
            id: crypto.randomUUID(),
            name: "",
            issuer: "",
            year: "",
            credentialUrl: "",
          })}
          fields={[
            { key: "name", label: "Certification" },
            { key: "issuer", label: "Issuer" },
            { key: "year", label: "Year awarded" },
            { key: "credentialUrl", label: "Credential link", type: "url" },
          ]}
        />
        <Entries
          title="Skill evidence"
          singular="Skill assessment"
          entries={document.skillEvidence}
          limit={100}
          onChange={(value) => change("skillEvidence", value)}
          create={() => ({
            id: crypto.randomUUID(),
            skill: "",
            level: "working" as const,
            evidence: "",
            lastUsedYear: "",
          })}
          fields={[
            { key: "skill", label: "Skill" },
            {
              key: "level",
              label: "Self-assessed level",
              type: "select",
              options: [
                { value: "foundation", label: "Foundation" },
                { value: "working", label: "Working knowledge" },
                { value: "advanced", label: "Advanced" },
                { value: "expert", label: "Expert" },
              ],
            },
            { key: "lastUsedYear", label: "Last used (year)" },
            {
              key: "evidence",
              label: "Where you used it and the result",
              type: "textarea",
              maxLength: 2000,
            },
          ]}
        />
      </fieldset>
      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t border-white/15 bg-[var(--bg)] py-4">
        <div className="min-w-0 basis-full text-sm sm:flex-1 sm:basis-auto">
          {saveError ? (
            <p role="alert" className="break-words text-rose-300">
              {saveError}
            </p>
          ) : (
            <p role="status" className={dirty ? "text-amber-300" : "text-emerald-400"}>
              {message ?? (dirty ? "Unsaved changes" : "")}
            </p>
          )}
        </div>
        {conflict ? (
          <button
            type="button"
            className={buttonClass}
            onClick={async () => {
              if (
                !window.confirm("Discard your unsaved career edits and reload the saved version?")
              )
                return;
              hydrated.current = false;
              setConflict(false);
              setSaveError(null);
              await refetch();
            }}
          >
            <RotateCcw size={16} /> Reload saved version
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass}
            disabled={!dirty || saving}
            aria-label="Discard changes"
            title="Discard changes"
            onClick={() => {
              setDocument(savedDocument);
              setSaveError(null);
              setMessage(null);
            }}
          >
            <RotateCcw size={16} />
            <span className="hidden sm:inline">Discard changes</span>
          </button>
        )}
        <button
          type="submit"
          disabled={saving || !candidateId || !dirty || conflict}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-black hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save career
          details
        </button>
      </div>
    </form>
  );
}
