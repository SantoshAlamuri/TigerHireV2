"use client";

import { useState, type ReactNode } from "react";
import type { Provider, SaveApiKeyInput } from "@/lib/validations/integrations";
import { StatusPill } from "@/components/settings/StatusPill";
import { ApiKeyForm } from "@/components/settings/ApiKeyForm";
import { OAuthConnectButton } from "@/components/settings/OAuthConnectButton";

interface IntegrationRowProps {
  provider: Provider;
  name: string;
  description: string;
  logoInitial: string;
  logoColor: { bg: string; text: string };
  authType: "api_key" | "oauth";
  status: "connected" | "disconnected" | "error";
  statusMessage?: string;
  category?: string;
  bucket?: string;
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
  maskedKey?: string;
  oauthAccountEmail?: string;
  config?: Record<string, unknown>;
  fields?: Array<{
    key: string;
    label: string;
    helpText?: string;
    helpLink?: string;
    secret?: boolean;
    optional?: boolean;
  }>;
  setupHint?: ReactNode;
  /** Hide configure/disconnect/validate actions for users without manage_integrations. */
  readOnly?: boolean;
  onSave: (data: SaveApiKeyInput) => Promise<void>;
  onDisconnect: () => Promise<void>;
  onValidate?: () => Promise<void>;
  oauthPathBase?: string;
}

function formatLabel(value: string): string {
  return value
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function healthBadgeClass(health: "healthy" | "degraded" | "idle") {
  if (health === "healthy") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (health === "degraded") return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  return "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]";
}

export function IntegrationRow(props: IntegrationRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [validating, setValidating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-4 backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold ${props.logoColor.bg} ${props.logoColor.text}`}
          >
            {props.logoInitial}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text)]">{props.name}</h3>
            <p className="text-xs text-[var(--text-muted)]">{props.description}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
              {props.bucket ? (
                <span className="rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-violet-300">
                  Bucket: {formatLabel(props.bucket)}
                </span>
              ) : null}
              {props.category ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2 py-0.5 text-[var(--text-muted)]">
                  {formatLabel(props.category)}
                </span>
              ) : null}
              {props.maturity ? (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-sky-300">
                  Maturity: {formatLabel(props.maturity)}
                </span>
              ) : null}
              {props.lifecycle?.health ? (
                <span
                  className={`rounded-full border px-2 py-0.5 ${healthBadgeClass(props.lifecycle.health)}`}
                >
                  Health: {formatLabel(props.lifecycle.health)}
                </span>
              ) : null}
            </div>
            {props.statusMessage ? (
              <p className="mt-1 text-xs text-red-300">{props.statusMessage}</p>
            ) : null}
            {props.maskedKey ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">Saved key: {props.maskedKey}</p>
            ) : null}
            {props.oauthAccountEmail ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Connected account: {props.oauthAccountEmail}
              </p>
            ) : null}
            {props.lifecycle?.lastUpdatedAt ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Last update: {new Date(props.lifecycle.lastUpdatedAt).toLocaleString()}
              </p>
            ) : null}
            {props.compliance ? (
              <p className="mt-1 text-xs text-[var(--text-subtle)]">
                Compliance: {props.compliance.hasSecretRef ? "secret" : "no-secret"} ·{" "}
                {props.compliance.hasAuditTrace ? "audited" : "no-audit"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill status={props.status} />
          {!props.readOnly && props.status !== "disconnected" ? (
            <button
              type="button"
              disabled={disconnecting}
              onClick={async () => {
                setDisconnecting(true);
                setActionError(null);
                try {
                  await props.onDisconnect();
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to disconnect integration",
                  );
                } finally {
                  setDisconnecting(false);
                }
              }}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-red-300"
            >
              Disconnect
            </button>
          ) : null}
          {!props.readOnly && props.onValidate ? (
            <button
              type="button"
              disabled={validating}
              onClick={async () => {
                setValidating(true);
                setActionError(null);
                try {
                  await props.onValidate?.();
                } catch (err) {
                  setActionError(
                    err instanceof Error ? err.message : "Failed to validate integration",
                  );
                } finally {
                  setValidating(false);
                }
              }}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)] disabled:opacity-60"
            >
              {validating ? "Validating..." : "Validate"}
            </button>
          ) : null}
          {!props.readOnly ? (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-muted)]"
            >
              {expanded ? "Hide" : "Configure"}
            </button>
          ) : null}
        </div>
      </div>

      {actionError ? (
        <p
          role="alert"
          className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {actionError}
        </p>
      ) : null}

      {expanded && props.setupHint ? (
        <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-200/90">
          {props.setupHint}
        </div>
      ) : null}

      {expanded && !props.readOnly ? (
        <div className="mt-4">
          {props.authType === "oauth" ? (
            <OAuthConnectButton provider={props.provider} oauthPathBase={props.oauthPathBase} />
          ) : (
            <ApiKeyForm
              provider={props.provider}
              fields={props.fields ?? [{ key: "apiKey", label: "API Key", secret: true }]}
              onSave={async (values) => {
                const fallbackKey =
                  values.apiKey ||
                  values.app_key ||
                  values.access_token ||
                  values.clientSecret ||
                  Object.values(values).find((val) => val && val.trim().length > 0) ||
                  "";
                await props.onSave({
                  provider: props.provider,
                  apiKey: values.apiKey ?? values.clientSecret ?? fallbackKey,
                  config: {
                    ...(props.config ?? {}),
                    ...values,
                  },
                });
              }}
            />
          )}
        </div>
      ) : null}
    </section>
  );
}
