"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

type Mode = "off" | "whatsapp" | "voice";

interface Screening {
  screening_default_mode: Mode;
  voice_screening_enabled: boolean;
  voice_screening_free_credits_per_month: number;
  voice_screening_monthly_cap_inr: number | null;
  screening_fitscore_threshold: number;
  screening_calling_hours_start: string;
  screening_calling_hours_end: string;
  screening_auto_trigger: boolean;
}

const DEFAULTS: Screening = {
  screening_default_mode: "whatsapp",
  voice_screening_enabled: false,
  voice_screening_free_credits_per_month: 10,
  voice_screening_monthly_cap_inr: null,
  screening_fitscore_threshold: 75,
  screening_calling_hours_start: "10:00",
  screening_calling_hours_end: "19:00",
  screening_auto_trigger: true,
};

const MODES: { mode: Mode; name: string; note: string }[] = [
  { mode: "whatsapp", name: "WhatsApp", note: "A short chat. Included in your plan." },
  { mode: "voice", name: "Voice call", note: "An AI phone call. ₹99 each after free credits." },
  { mode: "off", name: "Off", note: "No screening; you go straight from scores to review." },
];

export default function ScreeningSetupPage() {
  return (
    <Suspense fallback={null}>
      <ScreeningSetup />
    </Suspense>
  );
}

/** How candidates are screened before you see them, unless a job says otherwise. */
function ScreeningSetup() {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);
  const { data, loading, error, refetch } = useApiQuery<{ settings?: Partial<Screening> }>(
    "/api/settings/screening",
  );
  const [s, setS] = useState<Screening>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (data && !dirty) setS({ ...DEFAULTS, ...(data.settings ?? {}) });
  }, [data, dirty]);

  const set = <K extends keyof Screening>(k: K, v: Screening[K]) => {
    setS((p) => ({ ...p, [k]: v }));
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    if (s.screening_calling_hours_end <= s.screening_calling_hours_start)
      return setProblem("Calls must end after they start.");
    setSaving(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/screening", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify(s),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setProblem(body?.error ?? "Couldn't save. Try again.");
    }
    setDirty(false);
    setSaved(true);
    await refetch({ silent: true });
  };

  return (
    <SetupFrame
      sig="Screening"
      title="How candidates are screened."
      lede="Once a candidate scores above your bar, they get a few questions before you see them. Each job starts with these settings and can change them."
    >
      {loading && !data ? (
        <p role="status" className="wd-muted">
          Loading…
        </p>
      ) : error ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load screening settings. Reload to try again.
        </p>
      ) : (
        <>
          <fieldset
            className="wd-group"
            style={{ border: 0, margin: 0, padding: 0 }}
            disabled={!canEdit}
          >
            <legend className="wd-h2" style={{ marginBottom: 12 }}>
              Screen by
            </legend>
            <div className="wd-choices">
              {MODES.map((m) => (
                <label
                  key={m.mode}
                  className={`wd-choice ${s.screening_default_mode === m.mode ? "on" : ""}`}
                >
                  <input
                    type="radio"
                    name="mode"
                    checked={s.screening_default_mode === m.mode}
                    onChange={() => set("screening_default_mode", m.mode)}
                  />
                  <span style={{ display: "block", fontSize: 15 }}>{m.name}</span>
                  <span className="wd-src" style={{ display: "block", marginTop: 2 }}>
                    {m.note}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section
            className="wd-panel wd-stack"
            style={{ gap: 18 }}
            aria-label="When screening starts"
          >
            <div className="wd-conn-form" style={{ padding: 0, background: "transparent" }}>
              <label className="wd-stack" style={{ gap: 4 }}>
                <span className="wd-small wd-muted">Screen candidates scoring at least</span>
                <input
                  id="screen-bar"
                  type="number"
                  min={0}
                  max={100}
                  className="wd-input"
                  disabled={!canEdit}
                  value={s.screening_fitscore_threshold}
                  onChange={(e) =>
                    set(
                      "screening_fitscore_threshold",
                      Math.max(0, Math.min(100, Number(e.target.value))),
                    )
                  }
                />
              </label>
              <label className="wd-stack" style={{ gap: 4 }}>
                <span className="wd-small wd-muted">Calls from</span>
                <input
                  id="screen-from"
                  type="time"
                  className="wd-input"
                  disabled={!canEdit}
                  value={s.screening_calling_hours_start.slice(0, 5)}
                  onChange={(e) => set("screening_calling_hours_start", e.target.value)}
                />
              </label>
              <label className="wd-stack" style={{ gap: 4 }}>
                <span className="wd-small wd-muted">Calls until</span>
                <input
                  id="screen-to"
                  type="time"
                  className="wd-input"
                  disabled={!canEdit}
                  value={s.screening_calling_hours_end.slice(0, 5)}
                  onChange={(e) => set("screening_calling_hours_end", e.target.value)}
                />
              </label>
            </div>
            <div className="wd-line" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span>
                <span style={{ display: "block" }}>Start screening on its own</span>
                <span className="wd-src" style={{ display: "block" }}>
                  As soon as someone clears the bar, without waiting for you.
                </span>
              </span>
              <button
                type="button"
                className="wd-toggle"
                aria-pressed={s.screening_auto_trigger}
                aria-label="Start screening on its own"
                disabled={!canEdit}
                onClick={() => set("screening_auto_trigger", !s.screening_auto_trigger)}
              />
            </div>
          </section>

          {canEdit ? (
            <div className="wd-row-actions">
              <button
                type="button"
                className="wd-btn go"
                disabled={saving || !dirty}
                onClick={() => void save()}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              {saved && (
                <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
                  Saved. New jobs use these.
                </span>
              )}
            </div>
          ) : (
            <p className="wd-small wd-muted">Only admins can change these.</p>
          )}
          {problem && (
            <p role="alert" className="wd-problem">
              {problem}
            </p>
          )}
        </>
      )}
    </SetupFrame>
  );
}
