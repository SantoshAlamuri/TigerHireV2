"use client";

import { useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";

interface MyCalendarData {
  connection: {
    provider: string;
    status: string;
    email: string | null;
    message: string | null;
  } | null;
  available: { google: boolean; microsoft: boolean };
}

const NAME: Record<string, string> = { google_calendar: "Google Calendar", outlook: "Outlook" };

/**
 * Your calendar, connected once. TigerHire reads only when you're busy (never
 * what the event is) and adds interviews to it with a Meet or Teams link.
 */
export function MyCalendar({ returnTo = "/work/setup#calendars" }: { returnTo?: string } = {}) {
  const q = useApiQuery<MyCalendarData>("/api/me/calendar");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = q.data?.connection;
  const ok = c?.status === "connected";
  const here = returnTo;
  const href = (p: string) =>
    `/api/settings/me/integrations/oauth/${p}?next=${encodeURIComponent(here)}`;

  async function disconnect() {
    if (!c) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/settings/me/integrations/${c.provider}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Couldn't disconnect (${res.status})`);
      await q.refetch({ silent: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  }

  if (q.loading && !q.data) return <p className="wd-muted">Checking your calendar…</p>;
  const av = q.data?.available ?? { google: false, microsoft: false };

  return (
    <div className="wd-panel wd-stack" style={{ gap: 12 }}>
      <span className={`wd-sig ${ok ? "agent" : "you"}`}>
        {ok
          ? `${NAME[c!.provider] ?? "Calendar"} connected${c!.email ? `, ${c!.email}` : ""}`
          : c
            ? "Your calendar needs reconnecting"
            : "Your calendar isn't connected"}
      </span>
      <p className="wd-small wd-muted" style={{ margin: 0 }}>
        {ok
          ? "Interviews are only offered when you're free, and land on your calendar with a video link."
          : "Connect it once. We only read when you're busy, never what the meeting is."}
      </p>
      {error && <p className="wd-problem">{error}</p>}
      <div className="wd-row-actions">
        {(!ok || c?.provider !== "google_calendar") && av.google && (
          <a className={ok ? "wd-btn quiet" : "wd-btn go"} href={href("google_calendar")}>
            {c?.provider === "google_calendar" ? "Reconnect Google" : "Connect Google Calendar"}
          </a>
        )}
        {(!ok || c?.provider !== "outlook") && av.microsoft && (
          <a className="wd-btn" href={href("outlook")}>
            {c?.provider === "outlook" ? "Reconnect Outlook" : "Connect Outlook"}
          </a>
        )}
        {c && (
          <button
            type="button"
            className="wd-btn quiet"
            disabled={busy}
            onClick={() => void disconnect()}
          >
            {busy ? "Disconnecting…" : "Disconnect"}
          </button>
        )}
        {!av.google && !av.microsoft && (
          <span className="wd-src">
            Calendar sign-in isn&apos;t set up for this workspace yet. An admin adds the Google or
            Microsoft app keys.
          </span>
        )}
      </div>
    </div>
  );
}
