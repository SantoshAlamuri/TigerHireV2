"use client";

import { Suspense, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

interface Ticket {
  id: string;
  ticketNumber: string;
  created_at: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "cancelled";
  subject: string;
  resolution_notes: string | null;
}

const TOPICS = [
  { key: "general", name: "Something else" },
  { key: "access", name: "Signing in or access" },
  { key: "reliability", name: "Something isn't working" },
  { key: "billing", name: "Plan or billing" },
  { key: "onboarding", name: "Getting set up" },
] as const;

const STATUS: Record<Ticket["status"], string> = {
  open: "Waiting for us",
  in_progress: "We're on it",
  resolved: "Sorted",
  cancelled: "Closed",
};

const day = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(new Date(iso));

export default function HelpPage() {
  return (
    <Suspense fallback={null}>
      <Help />
    </Suspense>
  );
}

/** Ask the TigerHire team for help, and see what you've asked before. */
function Help() {
  const { data, loading, refetch } = useApiQuery<{ requests: Ticket[] }>("/api/support-requests", {
    limit: 50,
  });
  const [topic, setTopic] = useState<string>("general");
  const [subject, setSubject] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const send = async () => {
    if (subject.trim().length < 5)
      return setProblem("Give it a short title, at least five characters.");
    if (details.trim().length < 10)
      return setProblem("Tell us a little more, at least ten characters.");
    setBusy(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/support-requests", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({
        category: topic,
        priority: topic === "reliability" || topic === "access" ? "p2" : "p3",
        subject: subject.trim(),
        description: details.trim(),
        contextPath: "/work/setup/help",
      }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as {
      error?: string;
      ticketNumber?: string;
    } | null;
    if (!res?.ok) return setProblem(body?.error ?? "Couldn't send. Try again.");
    setSent(body?.ticketNumber ?? "your request");
    setSubject("");
    setDetails("");
    await refetch({ silent: true });
  };

  const tickets = data?.requests ?? [];

  return (
    <SetupFrame
      sig="Help"
      title="Ask the TigerHire team."
      lede="Tell us what's wrong or what you need. A person reads every request and replies by email."
    >
      <section className="wd-panel you wd-stack" style={{ gap: 16 }} aria-label="New request">
        <div className="wd-row-actions" role="radiogroup" aria-label="About" style={{ gap: 6 }}>
          {TOPICS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="radio"
              aria-checked={topic === t.key}
              className={`wd-chip ${topic === t.key ? "on" : ""}`}
              onClick={() => setTopic(t.key)}
            >
              {t.name}
            </button>
          ))}
        </div>
        <label className="wd-stack" style={{ gap: 4 }}>
          <span className="wd-small wd-muted">In a line</span>
          <input
            id="help-subject"
            className="wd-input"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </label>
        <label className="wd-stack" style={{ gap: 4 }}>
          <span className="wd-small wd-muted">What happened, or what you need</span>
          <textarea
            id="help-details"
            className="wd-textarea"
            style={{ minHeight: 0, height: 110 }}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn go" disabled={busy} onClick={() => void send()}>
            {busy ? "Sending…" : "Send"}
          </button>
          {sent && (
            <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
              Sent as {sent}. We&apos;ll reply by email.
            </span>
          )}
        </div>
        {problem && (
          <p role="alert" className="wd-problem">
            {problem}
          </p>
        )}
      </section>

      <section className="wd-group" aria-labelledby="tickets-h">
        <header className="wd-group-head">
          <h2 id="tickets-h" className="wd-h2">
            What you&apos;ve asked
          </h2>
          <span className="wd-small wd-muted">{tickets.length || ""}</span>
        </header>
        {loading && !data ? (
          <p role="status" className="wd-muted">
            Loading…
          </p>
        ) : tickets.length === 0 ? (
          <p className="wd-muted">Nothing yet.</p>
        ) : (
          <ul className="wd-rows">
            {tickets.map((t) => (
              <li
                key={t.id}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "14px 0" }}
              >
                <span>
                  <span style={{ display: "block" }}>{t.subject}</span>
                  <span className="wd-src" style={{ display: "block" }}>
                    {t.ticketNumber} · {day(t.created_at)}
                    {t.resolution_notes ? ` · ${t.resolution_notes}` : ""}
                  </span>
                </span>
                <span
                  className="wd-small"
                  style={{
                    color:
                      t.status === "resolved"
                        ? "var(--wd-good)"
                        : t.status === "cancelled"
                          ? "var(--wd-muted)"
                          : "var(--wd-amber)",
                  }}
                >
                  {STATUS[t.status]}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SetupFrame>
  );
}
