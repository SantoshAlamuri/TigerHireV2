"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { IdibuJobBoardSetupHint } from "@/components/settings/IdibuJobBoardSetupHint";
import { SettingsModule } from "@/components/settings/SettingsModule";
import { IntegrationRow } from "@/components/settings/IntegrationRow";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import { useApiQuery } from "@/lib/hooks/use-api";
import type { Provider, SaveApiKeyInput } from "@/lib/validations/integrations";

const VALIDATABLE_PROVIDERS = new Set<Provider>([
  "google_sso",
  "microsoft_sso",
  "okta_sso",
  "darwinbox",
  "keka",
  "hibob",
  "bamboohr",
  "workday",
]);

interface IntegrationApiRow {
  provider: Provider;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  bucket?: string;
  category?: string;
  maturity?: "registered" | "connected" | "operational" | "compliant" | "monitored";
  lifecycle?: {
    stage?: string;
    health?: "healthy" | "degraded" | "idle";
    lastUpdatedAt?: string;
  };
  compliance?: {
    hasSecretRef?: boolean;
    hasAuditTrace?: boolean;
    hasStatusMessage?: boolean;
  };
  masked_key?: string;
  oauth_account_email?: string;
  config?: Record<string, unknown>;
}

type HrisSyncProvider = "hibob" | "bamboohr" | "darwinbox" | "keka" | "workday";
type HrisSyncMode = "dry_run" | "live";

interface HrisSyncRun {
  id: string;
  provider: HrisSyncProvider;
  mode: HrisSyncMode;
  status: "running" | "succeeded" | "failed" | "cancelled";
  started_at: string;
  finished_at: string | null;
  summary?: {
    connectivity?: { ok?: boolean; message?: string };
    report?: { gapCount?: number };
  } | null;
  error_message: string | null;
}

function statusPillClass(status: HrisSyncRun["status"]): string {
  if (status === "succeeded") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  }
  if (status === "failed") {
    return "border-red-500/30 bg-red-500/10 text-red-300";
  }
  if (status === "running") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }
  return "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]";
}

export default function CompanySettingsIntegrationsPage() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery<{
    canManage?: boolean;
    integrations: IntegrationApiRow[];
  }>("/api/settings/org/integrations");
  const { data: scorecardData } = useApiQuery<{
    scorecard?: { readinessScore: number; passedControls: number; totalControls: number };
    integrations?: { total: number; connected: number; monitored: number };
  }>("/api/compliance/scorecard");
  const [notice, setNotice] = useState<string | null>(null);
  const [runningHrisSync, setRunningHrisSync] = useState(false);
  const [hrisSyncProvider, setHrisSyncProvider] = useState<HrisSyncProvider>("hibob");
  const [hrisSyncMode, setHrisSyncMode] = useState<HrisSyncMode>("dry_run");
  const {
    data: hrisSyncData,
    loading: hrisSyncLoading,
    error: hrisSyncError,
    refetch: refetchHrisSyncRuns,
  } = useApiQuery<{ runs: HrisSyncRun[] }>("/api/settings/org/integrations/hris/sync?limit=8");

  // GET requires view_settings only; a 403 ("Forbidden") means the caller can't
  // even view org settings (e.g. HM/interviewer/finance). Recruiters without
  // recruiterCanManageIntegrations get data but canManage=false. Either way the
  // page must render read-only instead of editable forms whose saves 403.
  const accessDenied = error === "Forbidden";
  const readOnly = accessDenied || data?.canManage === false;

  const integrationMap = useMemo(() => {
    const map = new Map<Provider, IntegrationApiRow>();
    (data?.integrations ?? []).forEach((row) => map.set(row.provider, row));
    return map;
  }, [data?.integrations]);

  const integrationSummary = useMemo(() => {
    const rows = data?.integrations ?? [];
    return {
      total: rows.length,
      connected: rows.filter((row) => row.status === "connected").length,
      monitored: rows.filter((row) => row.lifecycle?.health && row.lifecycle.health !== "idle")
        .length,
    };
  }, [data?.integrations]);

  const validationSnapshot = useMemo(() => {
    const rows = data?.integrations ?? [];
    return [...rows]
      .filter((row) => row.status !== "disconnected")
      .sort((a, b) => {
        const severity = (status: IntegrationApiRow["status"]) =>
          status === "error" ? 0 : status === "connected" ? 1 : 2;
        const diff = severity(a.status) - severity(b.status);
        if (diff !== 0) return diff;
        return a.provider.localeCompare(b.provider);
      })
      .slice(0, 8);
  }, [data?.integrations]);

  const companyProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter((provider) =>
        provider.scopeSupport?.includes("organisation"),
      ).filter(
        (provider) =>
          provider.provider !== "adzuna" &&
          provider.provider !== "indeed" &&
          provider.provider !== "google_calendar" &&
          provider.provider !== "outlook" &&
          provider.provider !== "teams" &&
          provider.provider !== "hibob" &&
          provider.provider !== "darwinbox" &&
          provider.provider !== "keka" &&
          provider.provider !== "springverify",
      ),
    [],
  );
  const bgvProviders = useMemo(
    () => SETTINGS_PROVIDERS.filter((provider) => provider.provider === "springverify"),
    [],
  );
  const ssoProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter((provider) =>
        ["google_sso", "microsoft_sso", "okta_sso"].includes(provider.provider),
      ),
    [],
  );

  const hrisProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter((provider) =>
        ["hibob", "bamboohr", "darwinbox", "keka", "workday"].includes(provider.provider),
      ),
    [],
  );

  const jobBoardProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter((provider) =>
        ["adzuna", "indeed", "idibu"].includes(provider.provider),
      ),
    [],
  );

  const calendarProviders = useMemo(
    () =>
      SETTINGS_PROVIDERS.filter(
        (provider) =>
          provider.provider === "google_calendar" ||
          provider.provider === "outlook" ||
          provider.provider === "teams",
      ),
    [],
  );

  async function saveIntegration(input: SaveApiKeyInput) {
    const response = await fetch("/api/settings/org/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || "Failed to save integration");
    }
    setNotice(`${input.provider} updated`);
    await refetch();
  }

  async function disconnectIntegration(provider: Provider) {
    const response = await fetch(`/api/settings/org/integrations/${provider}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: string };
      throw new Error(payload.error || "Failed to disconnect integration");
    }
    setNotice(`${provider} disconnected`);
    await refetch();
  }

  async function validateIntegration(provider: Provider) {
    const response = await fetch("/api/settings/org/integrations/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider }),
    });
    const payload = (await response.json()) as {
      error?: string;
      validation?: { message?: string; ok?: boolean };
    };
    if (!response.ok) {
      throw new Error(payload.error || "Failed to validate integration");
    }
    const message = payload.validation?.message ?? "Validation completed.";
    setNotice(message);
    await refetch();
  }

  async function runHrisSync() {
    setRunningHrisSync(true);
    try {
      const response = await fetch("/api/settings/org/integrations/hris/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: hrisSyncProvider, mode: hrisSyncMode }),
      });
      const payload = (await response.json()) as {
        error?: string;
        run?: { status?: string };
      };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to start HRIS sync");
      }
      setNotice(
        `HRIS sync started for ${hrisSyncProvider} (${hrisSyncMode}). Latest status: ${payload.run?.status ?? "running"}.`,
      );
      await Promise.all([refetchHrisSyncRuns(), refetch()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to start HRIS sync";
      setNotice(message);
    } finally {
      setRunningHrisSync(false);
    }
  }

  return (
    <SettingsModule
      embedded
      title="Integrations"
      subtitle="Connect calendar, meeting, transcription, and email providers"
    >
      <div className="space-y-6">
        <p className="card-lifted px-4 py-3 text-sm text-white/60">
          <span className="font-medium text-[var(--text)]">Custom HTTP callbacks</span> (HMAC outbox
          to your servers) are configured under{" "}
          <Link
            href="/company/settings/outbound-webhooks"
            className="text-[var(--accent)] underline-offset-2 hover:underline"
          >
            Outbound webhooks
          </Link>{" "}
          — not on this page.
        </p>
        {validationSnapshot.length > 0 ? (
          <section className="card-lifted p-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">Last validation results</h3>
              <span className="text-xs text-white/60">Errors first</span>
            </div>
            <div className="space-y-2">
              {validationSnapshot.map((row) => (
                <div
                  key={row.provider}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--text)]">{row.provider}</p>
                    <p className="text-xs text-white/60">
                      {row.status_message ?? "No validation message recorded."}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] ${
                      row.status === "error"
                        ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-fg)]"
                        : "border-[var(--status-success-border)] bg-[var(--status-success-bg)] text-[var(--status-success-fg)]"
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">
              Compliance score
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {scorecardData?.scorecard?.readinessScore ?? 0}%
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">Controls passed</p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {scorecardData?.scorecard?.passedControls ?? 0}/
              {scorecardData?.scorecard?.totalControls ?? 0}
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">
              Connected integrations
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {integrationSummary.connected}
            </p>
          </div>
          <div className="card-lifted p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-white/60">
              Monitored lifecycle
            </p>
            <p className="mt-1 text-lg font-semibold text-[var(--text)]">
              {integrationSummary.monitored}
            </p>
          </div>
        </section>

        {readOnly ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
          >
            You don&apos;t have permission to manage integrations. This page is read-only — ask a
            company admin to change integration settings.
          </p>
        ) : null}
        {notice ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
            {notice}
          </p>
        ) : null}
        {loading ? <p className="text-sm text-white/60">Loading integrations...</p> : null}
        {error && !accessDenied ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </p>
        ) : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Personal calendars</h3>
          <p className="text-xs text-white/60">
            Interviewers and recruiters should connect their own calendar accounts.
          </p>
          {calendarProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                onValidate={
                  VALIDATABLE_PROVIDERS.has(provider.provider)
                    ? () => validateIntegration(provider.provider)
                    : undefined
                }
              />
            );
          })}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Job boards</h3>
          <p className="text-xs text-white/60">
            Configure idibu, Adzuna, and Indeed. For idibu webhook URL details after connecting,
            expand the idibu card or open{" "}
            <Link
              href="/company/settings/job-boards"
              className="text-[var(--accent)] underline-offset-2 hover:underline"
            >
              Job boards
            </Link>
            .
          </p>
          {jobBoardProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            const setupHint =
              provider.provider === "idibu" &&
              user?.organisationId &&
              row?.status === "connected" ? (
                <IdibuJobBoardSetupHint organisationId={user.organisationId} />
              ) : undefined;
            return (
              <IntegrationRow
                key={provider.provider}
                setupHint={setupHint}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                onValidate={
                  VALIDATABLE_PROVIDERS.has(provider.provider)
                    ? () => validateIntegration(provider.provider)
                    : undefined
                }
              />
            );
          })}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">HRMS</h3>
          <p className="text-xs text-white/60">
            Configure HRMS connectors and run reconciliation checks. Full employee/requisition sync
            pipelines are surfaced in run reports as they roll out.
          </p>
          {/* HRIS sync APIs require manage_integrations; hide the runner for read-only viewers. */}
          {!readOnly ? (
            <div className="card-lifted space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-xs text-white/65">
                  <span className="mb-1 block">Provider</span>
                  <select
                    value={hrisSyncProvider}
                    onChange={(event) =>
                      setHrisSyncProvider(event.target.value as HrisSyncProvider)
                    }
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="hibob">hibob</option>
                    <option value="bamboohr">bamboohr</option>
                    <option value="darwinbox">darwinbox</option>
                    <option value="keka">keka</option>
                    <option value="workday">workday</option>
                  </select>
                </label>
                <label className="text-xs text-white/65">
                  <span className="mb-1 block">Mode</span>
                  <select
                    value={hrisSyncMode}
                    onChange={(event) => setHrisSyncMode(event.target.value as HrisSyncMode)}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  >
                    <option value="dry_run">dry_run</option>
                    <option value="live">live</option>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={runHrisSync}
                  disabled={runningHrisSync}
                  className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {runningHrisSync ? "Starting..." : "Run sync"}
                </button>
              </div>
              <p className="text-xs text-white/60">
                Dry-run validates connectivity and reconciliation gaps without mutating external
                systems.
              </p>
              {hrisSyncError ? (
                <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                  {hrisSyncError}
                </p>
              ) : null}
              {hrisSyncLoading ? (
                <p className="text-xs text-white/60">Loading recent sync runs...</p>
              ) : (
                <div className="space-y-2">
                  {(hrisSyncData?.runs ?? []).length === 0 ? (
                    <p className="text-xs text-white/60">No HRIS sync runs yet.</p>
                  ) : (
                    hrisSyncData?.runs.map((run) => (
                      <div
                        key={run.id}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs text-[var(--text)]">
                            {run.provider} · {run.mode} ·{" "}
                            {new Date(run.started_at).toLocaleString()}
                          </p>
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[11px] ${statusPillClass(run.status)}`}
                          >
                            {run.status}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-white/60">
                          {run.error_message ??
                            run.summary?.connectivity?.message ??
                            "Connectivity and reconciliation report generated."}
                        </p>
                        <p className="mt-1 text-[11px] text-white/45">
                          Gap count: {run.summary?.report?.gapCount ?? "n/a"}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ) : null}
          {hrisProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                onValidate={
                  VALIDATABLE_PROVIDERS.has(provider.provider)
                    ? () => validateIntegration(provider.provider)
                    : undefined
                }
              />
            );
          })}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            Background verification (SpringVerify)
          </h3>
          <p className="text-xs text-white/60">
            Connect your own SpringVerify India account to run BGV cases when offers are accepted.
            Paste the API token from SpringVerify → Settings → API, the create-case URL, and
            (optionally) your package/subtype IDs and webhook secret.
          </p>
          {bgvProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
              />
            );
          })}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Identity & SSO</h3>
          <p className="text-xs text-white/60">
            SSO connector buckets (Google, Microsoft, Okta) for enterprise identity policy mapping.
          </p>
          {ssoProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                onValidate={
                  VALIDATABLE_PROVIDERS.has(provider.provider)
                    ? () => validateIntegration(provider.provider)
                    : undefined
                }
              />
            );
          })}
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-[var(--text)]">Organisation tools</h3>
          <p className="text-xs text-white/60">
            Shared communication providers for this organisation.
          </p>
          {companyProviders.map((provider) => {
            const row = integrationMap.get(provider.provider);
            return (
              <IntegrationRow
                key={provider.provider}
                provider={provider.provider}
                name={provider.name}
                description={provider.description}
                logoInitial={provider.logoInitial}
                logoColor={provider.logoColor}
                authType={provider.authType}
                status={row?.status ?? "disconnected"}
                statusMessage={row?.status_message ?? undefined}
                bucket={row?.bucket}
                category={row?.category}
                maturity={row?.maturity}
                lifecycle={row?.lifecycle}
                compliance={row?.compliance}
                maskedKey={row?.masked_key}
                oauthAccountEmail={row?.oauth_account_email}
                config={row?.config ?? provider.defaultConfig}
                fields={provider.fields}
                readOnly={readOnly}
                onSave={saveIntegration}
                onDisconnect={() => disconnectIntegration(provider.provider)}
                onValidate={
                  VALIDATABLE_PROVIDERS.has(provider.provider)
                    ? () => validateIntegration(provider.provider)
                    : undefined
                }
              />
            );
          })}
        </section>

        <p className="card-lifted px-3 py-2 text-xs text-white/60">
          Interview room providers and transcription engines are managed in Platform Admin settings.
        </p>
      </div>
    </SettingsModule>
  );
}
