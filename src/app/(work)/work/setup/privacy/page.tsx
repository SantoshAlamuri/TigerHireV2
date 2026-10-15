"use client";

import { Suspense, useEffect, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

interface PrivacyRow {
  consent_message: string;
  recording_retention_days: number;
  transcript_retention_days: number;
}

interface AuditEntry {
  id: string;
  event_type: string;
  resource_type: string | null;
  actor_email: string | null;
  created_at: string;
}

interface Retention {
  pendingRequests: number;
  completedRequests: number;
  deletionsLast30d: number;
}

const DEFAULT_CONSENT =
  "This interview will be recorded and transcribed by TigerHire to help evaluate your application.";

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

/** "settings.permissions_updated" reads as "Settings permissions updated". */
const plain = (s: string) => s.replace(/[._]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function PrivacySetupPage() {
  return (
    <Suspense fallback={null}>
      <PrivacySetup />
    </Suspense>
  );
}

/** What candidates are told before a recording, how long recordings are kept, and who changed what. */
function PrivacySetup() {
  const privacy = useApiQuery<{ privacySettings: PrivacyRow }>("/api/settings/privacy");
  const audit = useApiQuery<{ entries: AuditEntry[] }>("/api/settings/audit", { limit: 50 });
  const retention = useApiQuery<Retention>("/api/compliance/retention-report");

  const [consent, setConsent] = useState(DEFAULT_CONSENT);
  const [recDays, setRecDays] = useState(90);
  const [txDays, setTxDays] = useState(365);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    const p = privacy.data?.privacySettings;
    if (!p || dirty) return;
    setConsent(p.consent_message ?? DEFAULT_CONSENT);
    setRecDays(p.recording_retention_days ?? 90);
    setTxDays(p.transcript_retention_days ?? 365);
  }, [privacy.data, dirty]);

  const touch = () => {
    setDirty(true);
    setSaved(false);
  };

  const save = async () => {
    if (consent.trim().length < 20)
      return setProblem("The consent message needs at least 20 characters.");
    if (recDays < 7 || recDays > 730) return setProblem("Keep recordings between 7 and 730 days.");
    if (txDays < 30 || txDays > 1825)
      return setProblem("Keep transcripts between 30 and 1,825 days.");
    setSaving(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/privacy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({
        consentMessage: consent.trim(),
        recordingRetentionDays: recDays,
        transcriptRetentionDays: txDays,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setProblem(body?.error ?? "Couldn't save. Only admins can change privacy settings.");
    }
    setDirty(false);
    setSaved(true);
    await privacy.refetch({ silent: true });
  };

  const entries = audit.data?.entries ?? [];

  return (
    <SetupFrame
      sig="Privacy"
      title="Privacy and records."
      lede="What candidates hear before an interview is recorded, how long recordings and transcripts are kept, and a log of every settings change."
    >
      <section
        className="wd-panel wd-stack"
        style={{ gap: 18 }}
        aria-label="Recording and retention"
      >
        <label className="wd-stack" style={{ gap: 6 }}>
          <span className="wd-small wd-muted">Told to candidates before recording</span>
          <textarea
            id="privacy-consent"
            className="wd-textarea"
            style={{ minHeight: 0, height: 90 }}
            value={consent}
            onChange={(e) => {
              setConsent(e.target.value);
              touch();
            }}
          />
        </label>
        <div className="wd-conn-form" style={{ padding: 0, background: "transparent" }}>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">Keep recordings for (days)</span>
            <input
              id="privacy-rec"
              type="number"
              min={7}
              max={730}
              className="wd-input"
              value={recDays}
              onChange={(e) => {
                setRecDays(Number(e.target.value));
                touch();
              }}
            />
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">Keep transcripts for (days)</span>
            <input
              id="privacy-tx"
              type="number"
              min={30}
              max={1825}
              className="wd-input"
              value={txDays}
              onChange={(e) => {
                setTxDays(Number(e.target.value));
                touch();
              }}
            />
          </label>
        </div>
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
              Saved.
            </span>
          )}
        </div>
        {problem && (
          <p role="alert" className="wd-problem">
            {problem}
          </p>
        )}
      </section>

      {retention.data && (
        <dl
          className="wd-numbers wd-home-numbers"
          style={{ gridTemplateColumns: "repeat(3, minmax(0,1fr))" }}
        >
          <div className="wd-number">
            <dt>Data requests open</dt>
            <dd>{retention.data.pendingRequests}</dd>
          </div>
          <div className="wd-number">
            <dt>Data requests done</dt>
            <dd>{retention.data.completedRequests}</dd>
          </div>
          <div className="wd-number">
            <dt>Deleted in the last 30 days</dt>
            <dd>{retention.data.deletionsLast30d}</dd>
          </div>
        </dl>
      )}

      <section className="wd-group" aria-labelledby="audit-h">
        <header className="wd-group-head">
          <h2 id="audit-h" className="wd-h2">
            Recent settings changes
          </h2>
          <span className="wd-small wd-muted">Last {entries.length || 50}</span>
        </header>
        {audit.loading && !audit.data ? (
          <p role="status" className="wd-muted">
            Loading…
          </p>
        ) : audit.error ? (
          <p className="wd-muted">You don&apos;t have access to the log. Ask an admin.</p>
        ) : entries.length === 0 ? (
          <p className="wd-muted">No changes yet.</p>
        ) : (
          <div className="wd-table-wrap">
            <table className="wd-table">
              <thead>
                <tr>
                  <th scope="col">What changed</th>
                  <th scope="col">Who</th>
                  <th scope="col">When</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      {plain(e.event_type)}
                      {e.resource_type ? (
                        <span className="wd-src"> · {plain(e.resource_type)}</span>
                      ) : null}
                    </th>
                    <td>{e.actor_email ?? "System"}</td>
                    <td>{when(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </SetupFrame>
  );
}
