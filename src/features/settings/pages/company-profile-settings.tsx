"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { useApiQuery } from "@/lib/hooks/use-api";

function normalizeEmailDomain(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return "";
  const domain = trimmed.includes("@") ? (trimmed.split("@").pop() ?? "") : trimmed;
  return domain.replace(/^@+/, "").trim();
}

type OrganisationPayload = {
  id: string;
  name: string | null;
  email_domain: string | null;
  enforce_2fa?: boolean | null;
};

export function CompanyProfileSettingsPageContent({ embedded = true }: { embedded?: boolean }) {
  const { data, loading, error, refetch } = useApiQuery<{ organisation?: OrganisationPayload }>(
    "/api/organisations",
  );
  const [emailDomain, setEmailDomain] = useState("");
  const [enforce2fa, setEnforce2fa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const organisation = useMemo(() => data?.organisation ?? null, [data?.organisation]);

  useEffect(() => {
    setEmailDomain(organisation?.email_domain ?? "");
    setEnforce2fa(Boolean(organisation?.enforce_2fa));
  }, [organisation?.email_domain, organisation?.enforce_2fa]);

  async function saveEmailDomain() {
    setSaving(true);
    setNotice(null);
    setSaveError(null);
    try {
      const normalized = normalizeEmailDomain(emailDomain);
      const res = await fetch("/api/organisations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email_domain: normalized, enforce_2fa: enforce2fa }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setSaveError(json.error ?? "Could not save company settings.");
        return;
      }
      setEmailDomain(normalized);
      setNotice("Company settings saved.");
      await refetch();
    } catch {
      setSaveError("Could not save company settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsModule embedded={embedded} title="Company profile" subtitle="">
      <div className="space-y-6">
        <p className="text-sm text-white/60">
          Basic organisation details used for referrer verification and branding.
        </p>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-white/60">
            <Loader2 size={16} className="animate-spin" />
            Loading company settings...
          </div>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}
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

        <div>
          <label
            htmlFor="company-email-domain"
            className="mb-1.5 block text-body text-sm text-white/60"
          >
            Company email domain
          </label>
          <input
            id="company-email-domain"
            type="text"
            placeholder="yourcompany.com"
            value={emailDomain}
            onChange={(e) => setEmailDomain(e.target.value)}
            className="w-full card-lifted px-4 py-2.5 text-body text-sm text-[var(--text)] placeholder:text-white/60 focus:border-white/20 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          <p className="mt-1 text-xs text-white/60">
            Employees who sign up as referrers with a matching work email will be automatically
            verified
          </p>
        </div>

        {/*
          Org #3: the enforce-2FA toggle is intentionally disabled. There is no
          MFA enrollment/challenge flow yet, and the login AAL check can't reach
          aal2 — so enabling enforcement would lock out the entire org. The
          toggle is shown read-only (reflecting any stored value) until MFA
          enrollment ships as its own workstream. saveEmailDomain still sends the
          stored value unchanged, so this can't silently flip the setting.
        */}
        <div className="card-lifted p-4 opacity-60">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">
                Require two-factor authentication
                <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/70">
                  Coming soon
                </span>
              </h3>
              <p className="mt-1 text-xs text-white/60">
                Two-factor enforcement will be available once authenticator enrollment ships. It is
                disabled for now to avoid locking out your team.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-white/40">
              <input
                type="checkbox"
                checked={enforce2fa}
                disabled
                aria-disabled="true"
                className="h-4 w-4 cursor-not-allowed rounded border-[var(--border)] bg-[var(--bg)]"
              />
              Enforce
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/60">Changes apply to your organisation immediately.</p>
          <button
            type="button"
            onClick={saveEmailDomain}
            disabled={saving || loading}
            className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </div>
    </SettingsModule>
  );
}
