"use client";

import { useEffect, useState } from "react";
import { SettingsEditableForm } from "@/components/settings/SettingsEditableForm";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { hiringSetupSectionsForBase } from "@/features/settings/config/sections";
import { canEditOrgHiringSettings } from "@/lib/settings/org-hiring-settings-auth";
import { useAuth } from "@/lib/auth/AuthProvider";

type ScreeningSettings = {
  screening_default_mode: "off" | "whatsapp" | "voice";
  voice_screening_enabled: boolean;
  voice_screening_free_credits_per_month: number;
  voice_screening_monthly_cap_inr: number | null;
  screening_fitscore_threshold: number;
  screening_calling_hours_start: string;
  screening_calling_hours_end: string;
  screening_auto_trigger: boolean;
};

const DEFAULTS: ScreeningSettings = {
  screening_default_mode: "whatsapp",
  voice_screening_enabled: false,
  voice_screening_free_credits_per_month: 10,
  voice_screening_monthly_cap_inr: null,
  screening_fitscore_threshold: 75,
  screening_calling_hours_start: "10:00",
  screening_calling_hours_end: "19:00",
  screening_auto_trigger: true,
};

export function ScreeningSettingsPageContent({
  basePath = "/company/settings",
}: {
  basePath?: string;
}) {
  const { user } = useAuth();
  const canEdit = canEditOrgHiringSettings(user);
  const [settings, setSettings] = useState<ScreeningSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/settings/screening", { credentials: "include" });
        const payload = (await response.json().catch(() => ({}))) as {
          settings?: Partial<ScreeningSettings>;
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "Failed to load settings");
        if (!cancelled) setSettings({ ...DEFAULTS, ...(payload.settings ?? {}) });
      } catch (error) {
        if (!cancelled)
          setNotice(error instanceof Error ? error.message : "Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/settings/screening", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        settings?: Partial<ScreeningSettings>;
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Failed to save settings");
      setSettings({ ...settings, ...(payload.settings ?? {}) });
      setNotice("Screening settings saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsModule
      title="Screening"
      subtitle="Default mode and thresholds for candidate screening"
      basePath={basePath}
      sections={hiringSetupSectionsForBase(basePath)}
      sectionsNavLabel="Hiring setup"
    >
      {loading ? (
        <p className="text-sm text-white/65">Loading screening settings…</p>
      ) : (
        <SettingsEditableForm>
          <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/35 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Default mode
            </p>
            <p className="text-sm text-white/65">
              WhatsApp sends your company name, role, and screening questions when candidates apply
              or when you upload CVs (if we have their phone). Turn off to skip automated WhatsApp
              screening for your organisation.
            </p>
            <div className="flex flex-wrap gap-2">
              {(["off", "whatsapp", "voice"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSettings((prev) => ({ ...prev, screening_default_mode: mode }))}
                  className={
                    settings.screening_default_mode === mode
                      ? "rounded-md border border-[var(--accent)] bg-[var(--accent)]/20 px-3 py-2 text-sm text-[var(--text)]"
                      : "rounded-md border border-[var(--border)] px-3 py-2 text-sm text-white/70"
                  }
                >
                  {mode === "off"
                    ? "Off"
                    : mode === "whatsapp"
                      ? "WhatsApp (included)"
                      : "Voice (₹99)"}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/35 p-4">
            <label className="block space-y-1">
              <span className="text-xs text-white/45">Trigger threshold (FitScore)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={settings.screening_fitscore_threshold}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    screening_fitscore_threshold: Number(e.target.value),
                  }))
                }
                className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
              />
            </label>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/35 p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs text-white/45">Voice calling hours start</span>
                <input
                  type="time"
                  value={settings.screening_calling_hours_start.slice(0, 5)}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      screening_calling_hours_start: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-white/45">Voice calling hours end</span>
                <input
                  type="time"
                  value={settings.screening_calling_hours_end.slice(0, 5)}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      screening_calling_hours_end: e.target.value,
                    }))
                  }
                  className="w-full rounded-md border border-[var(--border-interactive)] bg-[var(--surface)]/70 px-3 py-2 text-sm text-[var(--text)]"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)]/35 p-4">
            <label className="flex items-center gap-2 text-sm text-white/75">
              <input
                type="checkbox"
                checked={settings.screening_auto_trigger}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, screening_auto_trigger: e.target.checked }))
                }
              />
              Auto-trigger screening when threshold is met
            </label>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-1">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-md bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save screening settings"}
            </button>

            {notice ? <p className="text-sm text-white/70">{notice}</p> : null}
          </div>
        </SettingsEditableForm>
      )}
    </SettingsModule>
  );
}
