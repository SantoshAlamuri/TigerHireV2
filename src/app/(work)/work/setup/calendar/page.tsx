"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useApiQuery } from "@/lib/hooks/use-api";
import { SetupFrame, useFromWelcome } from "@/components/work/setup/SetupFrame";

interface Connection {
  provider: string;
  status: "connected" | "disconnected" | "error";
  status_message: string | null;
  oauth_account_email?: string;
}

const CALENDARS = [
  { provider: "google_calendar", name: "Google Calendar", note: "Gmail or Google Workspace" },
  { provider: "outlook", name: "Microsoft Outlook", note: "Outlook or Microsoft 365" },
] as const;

export default function CalendarSetupPage() {
  return (
    <Suspense fallback={null}>
      <CalendarSetup />
    </Suspense>
  );
}

/**
 * Connect a calendar: two choices, one press each. Interviews then book into
 * real free time. Connecting goes out to Google or Microsoft and comes back here.
 */
function CalendarSetup() {
  const fromWelcome = useFromWelcome();
  const justConnected = useSearchParams().get("connected");
  const { data, loading, error, refetch } = useApiQuery<{ integrations: Connection[] }>(
    "/api/settings/me/integrations",
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const byProvider = new Map((data?.integrations ?? []).map((c) => [c.provider, c]));
  const connected = CALENDARS.filter((c) => byProvider.get(c.provider)?.status === "connected");
  const returnTo = `/work/setup/calendar${fromWelcome ? "?from=welcome" : ""}`;

  const disconnect = async (provider: string) => {
    setBusy(provider);
    setProblem(null);
    const res = await fetch(`/api/settings/me/integrations/${provider}`, {
      method: "DELETE",
      credentials: "include",
    }).catch(() => null);
    setBusy(null);
    if (!res?.ok) setProblem("Couldn't disconnect. Try again.");
    await refetch({ silent: true });
  };

  return (
    <SetupFrame
      sig="Your calendar"
      title={connected.length ? "Your calendar is connected." : "Connect your calendar."}
      lede="Interviews book themselves into your real free time, and land in your calendar with the video link. We only read when you're busy and add the interviews."
      done={connected.length > 0}
    >
      {justConnected && connected.length > 0 && (
        <p role="status" className="wd-small" style={{ color: "var(--wd-good)", margin: 0 }}>
          Connected. You&apos;re all set here.
        </p>
      )}
      {loading && !data ? (
        <p role="status" className="wd-muted">
          Checking your calendars…
        </p>
      ) : error ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your calendars. Reload to try again.
        </p>
      ) : (
        <ul className="wd-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {CALENDARS.map((c) => {
            const row = byProvider.get(c.provider);
            const on = row?.status === "connected";
            return (
              <li
                key={c.provider}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "18px 0" }}
              >
                <span>
                  <span style={{ display: "block", fontSize: 16 }}>{c.name}</span>
                  <span className="wd-src" style={{ display: "block" }}>
                    {on
                      ? `Connected${row?.oauth_account_email ? ` as ${row.oauth_account_email}` : ""}`
                      : row?.status === "error"
                        ? (row.status_message ?? "Needs reconnecting")
                        : c.note}
                  </span>
                </span>
                {on ? (
                  <button
                    type="button"
                    className="wd-btn quiet"
                    disabled={busy === c.provider}
                    onClick={() => void disconnect(c.provider)}
                  >
                    {busy === c.provider ? "Disconnecting…" : "Disconnect"}
                  </button>
                ) : (
                  <a
                    href={`/api/settings/me/integrations/oauth/${c.provider}?next=${encodeURIComponent(returnTo)}`}
                    className={`wd-btn ${connected.length ? "" : "go"}`}
                  >
                    {row?.status === "error" ? "Reconnect" : "Connect"}
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {problem && (
        <p role="alert" className="wd-problem">
          {problem}
        </p>
      )}
    </SetupFrame>
  );
}
