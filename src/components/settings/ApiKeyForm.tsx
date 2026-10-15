"use client";

import { useMemo, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import type { Provider } from "@/lib/validations/integrations";

interface ApiKeyFormProps {
  provider: Provider;
  fields: Array<{
    key: string;
    label: string;
    helpText?: string;
    helpLink?: string;
    secret?: boolean;
    optional?: boolean;
  }>;
  onSave: (values: Record<string, string>) => Promise<void>;
}

export function ApiKeyForm({ provider, fields, onSave }: ApiKeyFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [showValues, setShowValues] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave = useMemo(
    () => fields.every((field) => field.optional || (values[field.key] ?? "").trim().length > 0),
    [fields, values],
  );

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      await onSave(values);
      setValues({});
    } catch (err) {
      // Surface the server's message (e.g. validation or 403) instead of swallowing it.
      setError(err instanceof Error ? err.message : "Failed to save integration");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
      {fields.map((field) => {
        const show = !!showValues[field.key];
        return (
          <div key={`${provider}-${field.key}`}>
            <label className="mb-1 block text-xs text-[var(--text-muted)]">{field.label}</label>
            <div className="relative">
              <input
                type={field.secret && !show ? "password" : "text"}
                value={values[field.key] ?? ""}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    [field.key]: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 pr-9 text-sm text-[var(--text)]"
                placeholder={`Enter ${field.label}`}
              />
              {field.secret ? (
                <button
                  type="button"
                  aria-label={`Toggle ${field.label} visibility`}
                  onClick={() =>
                    setShowValues((prev) => ({
                      ...prev,
                      [field.key]: !prev[field.key],
                    }))
                  }
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]"
                >
                  {show ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              ) : null}
            </div>
            {field.helpText ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                {field.helpText}{" "}
                {field.helpLink ? (
                  <a
                    href={field.helpLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[var(--accent)] underline"
                  >
                    Docs
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>
        );
      })}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        disabled={!canSave || saving}
        onClick={handleSubmit}
        className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
      >
        {saving ? <Loader2 size={14} className="animate-spin" /> : null}
        Save integration key
      </button>
    </div>
  );
}
