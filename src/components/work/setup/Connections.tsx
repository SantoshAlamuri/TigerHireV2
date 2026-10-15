"use client";

import { useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SETTINGS_PROVIDERS } from "@/features/settings/config/providers";
import type { IntegrationDescriptor } from "@/features/settings/types";

interface Row {
  provider: string;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  masked_key?: string;
  config?: Record<string, unknown>;
}

export interface ConnectionGroup {
  title: string;
  providers: string[];
}

/** The key the API stores; the first secret-looking value the person typed. */
function primaryKey(values: Record<string, string>): string {
  return (
    values.apiKey ||
    values.clientSecret ||
    values.app_key ||
    values.app_secret ||
    values.access_token ||
    Object.values(values).find((v) => v.trim().length > 0) ||
    ""
  );
}

function ConnectionRow({
  d,
  row,
  onChanged,
}: {
  d: IntegrationDescriptor;
  row: Row | undefined;
  onChanged: () => Promise<void>;
}) {
  const fields = d.fields ?? [{ key: "apiKey", label: "API key", secret: true }];
  const on = row?.status === "connected";
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const save = async () => {
    const missing = fields.filter((f) => !f.optional && !values[f.key]?.trim());
    if (missing.length) return setProblem(`Add the ${missing[0].label.toLowerCase()}.`);
    setBusy(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/org/integrations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({
        provider: d.provider,
        apiKey: primaryKey(values),
        config: { ...(row?.config ?? d.defaultConfig ?? {}), ...values },
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as {
        error?: string;
        detail?: string;
      } | null;
      return setProblem(body?.detail ?? body?.error ?? "Couldn't connect. Check the details.");
    }
    setOpen(false);
    setValues({});
    await onChanged();
  };

  const disconnect = async () => {
    setBusy(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch(`/api/settings/org/integrations/${d.provider}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrf,
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setProblem("Couldn't disconnect. Try again.");
    await onChanged();
  };

  return (
    <li className="wd-conn">
      <div className="wd-conn-head">
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 16 }}>{d.name}</span>
          <span className="wd-src" style={{ display: "block" }}>
            {row?.status === "error"
              ? (row.status_message ?? "Needs attention")
              : on
                ? `Connected${row?.masked_key ? ` · ${row.masked_key}` : ""}`
                : d.description}
          </span>
        </span>
        <span className="wd-row-actions" style={{ gap: 6 }}>
          {on && (
            <button
              type="button"
              className="wd-btn quiet"
              disabled={busy}
              onClick={() => void disconnect()}
            >
              Disconnect
            </button>
          )}
          <button
            type="button"
            className={`wd-btn ${on ? "" : "go"}`}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : on ? "Update" : "Connect"}
          </button>
        </span>
      </div>
      {open && (
        <div className="wd-conn-form">
          {fields.map((f) => (
            <label key={f.key} className="wd-stack" style={{ gap: 4 }}>
              <span className="wd-small wd-muted">
                {f.label}
                {f.optional ? " (optional)" : ""}
              </span>
              <input
                id={`${d.provider}-${f.key}`}
                className="wd-input"
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              {f.helpText && <span className="wd-src">{f.helpText}</span>}
            </label>
          ))}
          <div className="wd-row-actions">
            <button type="button" className="wd-btn go" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : on ? "Save" : "Connect"}
            </button>
          </div>
        </div>
      )}
      {problem && (
        <p role="alert" className="wd-problem">
          {problem}
        </p>
      )}
    </li>
  );
}

/** Company-wide connections, grouped by what they're for. Keys are saved encrypted by the API. */
export function Connections({ groups }: { groups: ConnectionGroup[] }) {
  const { data, loading, error, refetch } = useApiQuery<{ integrations: Row[] }>(
    "/api/settings/org/integrations",
  );
  const rows = new Map((data?.integrations ?? []).map((r) => [r.provider, r]));
  const byId = new Map(SETTINGS_PROVIDERS.map((p) => [p.provider as string, p]));
  const refresh = async () => {
    await refetch({ silent: true });
  };

  if (loading && !data)
    return (
      <p role="status" className="wd-muted">
        Loading connections…
      </p>
    );
  if (error)
    return (
      <p role="alert" className="wd-problem">
        Couldn&apos;t load connections. Reload to try again.
      </p>
    );

  return (
    <>
      {groups.map((g) => {
        const list = g.providers
          .map((id) => byId.get(id))
          .filter(Boolean) as IntegrationDescriptor[];
        const connected = list.filter((d) => rows.get(d.provider)?.status === "connected").length;
        return (
          <section key={g.title} className="wd-group" aria-label={g.title}>
            <header className="wd-group-head">
              <h2 className="wd-h2">{g.title}</h2>
              <span className="wd-small wd-muted">
                {connected ? `${connected} connected` : "None connected"}
              </span>
            </header>
            <ul className="wd-conns">
              {list.map((d) => (
                <ConnectionRow
                  key={d.provider}
                  d={d}
                  row={rows.get(d.provider)}
                  onChanged={refresh}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}
