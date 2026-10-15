"use client";

import { Suspense, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { ROLE_LABELS } from "@/types/database";
import type { EmailPreferences } from "@/types";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

/** The emails someone hiring cares about, in their words. Job alerts are for candidates. */
const EMAILS: { key: keyof EmailPreferences; name: string; note: string }[] = [
  {
    key: "interview_reminders",
    name: "Interview reminders",
    note: "Before each interview you're on",
  },
  {
    key: "application_updates",
    name: "Candidate updates",
    note: "When someone moves forward or drops out",
  },
  { key: "messages", name: "Messages", note: "When a candidate replies" },
  { key: "weekly_digest", name: "Weekly summary", note: "Monday morning, how your jobs are doing" },
  { key: "marketing", name: "Product news", note: "New features, now and then" },
];

const SIGN_INS = [
  { provider: "google", name: "Google" },
  { provider: "linkedin_oidc", name: "LinkedIn" },
] as const;

async function send(url: string, method: string, body: unknown) {
  const csrf = await buildCsrfHeaders().catch(() => ({}));
  return fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...csrf },
    body: JSON.stringify(body),
  }).catch(() => null);
}

export default function ProfileSetupPage() {
  return (
    <Suspense fallback={null}>
      <ProfileSetup />
    </Suspense>
  );
}

/** You: your name, how you sign in, and which emails you get. */
function ProfileSetup() {
  const { user } = useAuth();
  const profileQ = useApiQuery<{ profile: { full_name?: string | null } }>("/api/profiles");
  const prefsQ = useApiQuery<{ preferences: EmailPreferences }>("/api/email-preferences");
  const linksQ = useApiQuery<{ identities: { provider: string }[] }>("/api/auth/link");

  const [name, setName] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [prefs, setPrefs] = useState<EmailPreferences | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const savedName = profileQ.data?.profile?.full_name ?? user?.name ?? "";
  useEffect(() => setName(savedName), [savedName]);
  useEffect(() => {
    if (prefsQ.data?.preferences) setPrefs(prefsQ.data.preferences);
  }, [prefsQ.data]);

  const saveName = async () => {
    if (name.trim().length < 2) return setProblem("Your name needs at least two letters.");
    setSavingName(true);
    setProblem(null);
    const res = await send("/api/profiles", "PATCH", { name: name.trim() });
    setSavingName(false);
    if (!res?.ok) return setProblem("Couldn't save your name. Try again.");
    setNameSaved(true);
    await profileQ.refetch({ silent: true });
  };

  const toggle = async (key: keyof EmailPreferences) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    const res = await send("/api/email-preferences", "PATCH", next);
    if (!res?.ok) {
      setPrefs(prefs);
      setProblem("Couldn't change that email setting. Try again.");
    }
  };

  const link = async (provider: string) => {
    setLinking(provider);
    setProblem(null);
    const res = await send("/api/auth/link", "POST", { provider });
    const body = (await res?.json().catch(() => null)) as {
      url?: string;
      data?: { url?: string };
    } | null;
    const url = body?.url ?? body?.data?.url;
    if (url) window.location.assign(url);
    else {
      setLinking(null);
      setProblem("Couldn't start linking that account. Try again.");
    }
  };

  const linked = new Set((linksQ.data?.identities ?? []).map((i) => i.provider));

  return (
    <SetupFrame
      sig="You"
      title={savedName ? savedName : "Your profile."}
      lede="Your name as your team and candidates see it, the accounts you sign in with, and which emails you get."
    >
      <section className="wd-panel wd-stack" style={{ gap: 18 }} aria-label="Your details">
        <label className="wd-stack" style={{ gap: 6 }}>
          <span className="wd-small wd-muted">Your name</span>
          <input
            id="profile-name"
            className="wd-input"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setNameSaved(false);
            }}
          />
        </label>
        <div className="wd-lines" style={{ borderBottom: 0 }}>
          <div className="wd-line" style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}>
            <span className="wd-line-label">Email</span>
            <span className="wd-line-value">{user?.email ?? "—"}</span>
          </div>
          <div className="wd-line" style={{ gridTemplateColumns: "140px minmax(0,1fr)" }}>
            <span className="wd-line-label">Role</span>
            <span className="wd-line-value">
              {user ? ROLE_LABELS[user.role] : "—"}
              {user?.isOrgAdmin ? ", admin" : ""}
            </span>
          </div>
        </div>
        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={savingName || name.trim() === savedName}
            onClick={() => void saveName()}
          >
            {savingName ? "Saving…" : "Save name"}
          </button>
          {nameSaved && (
            <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
              Saved.
            </span>
          )}
        </div>
      </section>

      <section className="wd-group" aria-labelledby="signin-h">
        <header className="wd-group-head">
          <h2 id="signin-h" className="wd-h2">
            Sign in with
          </h2>
        </header>
        <ul className="wd-rows">
          {SIGN_INS.map((s) => (
            <li
              key={s.provider}
              className="wd-line"
              style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "14px 0" }}
            >
              <span>{s.name}</span>
              {linked.has(s.provider) ? (
                <span className="wd-small" style={{ color: "var(--wd-good)" }}>
                  Linked
                </span>
              ) : (
                <button
                  type="button"
                  className="wd-btn quiet"
                  disabled={linking !== null}
                  onClick={() => void link(s.provider)}
                >
                  {linking === s.provider ? "Opening…" : "Link"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="wd-group" aria-labelledby="emails-h">
        <header className="wd-group-head">
          <h2 id="emails-h" className="wd-h2">
            Emails you get
          </h2>
        </header>
        {!prefs ? (
          <p role="status" className="wd-muted">
            Loading…
          </p>
        ) : (
          <ul className="wd-rows">
            {EMAILS.map((e) => (
              <li
                key={e.key}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "14px 0" }}
              >
                <span>
                  <span style={{ display: "block" }}>{e.name}</span>
                  <span className="wd-src" style={{ display: "block" }}>
                    {e.note}
                  </span>
                </span>
                <button
                  type="button"
                  className="wd-toggle"
                  aria-pressed={prefs[e.key]}
                  aria-label={`${e.name} ${prefs[e.key] ? "on" : "off"}`}
                  onClick={() => void toggle(e.key)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {problem && (
        <p role="alert" className="wd-problem">
          {problem}
        </p>
      )}
    </SetupFrame>
  );
}
