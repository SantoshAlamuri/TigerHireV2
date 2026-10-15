"use client";

import { Suspense, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";
import type { UserRole } from "@/types/database";
import { parseEmails } from "@/lib/work/team";

interface Member {
  id: string;
  full_name: string;
  role: UserRole;
  is_active?: boolean;
  is_org_admin?: boolean;
  email?: string;
}

interface Invite {
  id: string;
  email: string;
  role: UserRole;
}

/** The roles people actually pick, each said in terms of what the person will do. */
const ROLES: { role: UserRole; name: string; does: string }[] = [
  { role: "recruiter", name: "Recruiter", does: "Runs jobs end to end" },
  { role: "hiring_manager", name: "Hiring manager", does: "Only sees decisions that are theirs" },
  { role: "interviewer", name: "Interviewer", does: "Gets interviews and a scorecard" },
  { role: "leadership", name: "Leadership", does: "Sees everything, approves roles" },
  { role: "finance", name: "Finance", does: "Approves budgets and offers" },
];

const ROLE_NAME = new Map(ROLES.map((r) => [r.role, r.name]));
const nameFor = (role: UserRole) => ROLE_NAME.get(role) ?? role.replace(/_/g, " ");

export default function TeamSetupPage() {
  return (
    <Suspense fallback={null}>
      <TeamSetup />
    </Suspense>
  );
}

/**
 * Invite your team: paste one or more emails, pick what they'll do, send.
 * Everyone already here and everyone invited sits underneath.
 */
function TeamSetup() {
  const { user } = useAuth();
  const { data, loading, error, refetch } = useApiQuery<{
    members: Member[];
    pendingInvites: Invite[];
  }>("/api/organisations/members");
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<UserRole>("recruiter");
  const [sending, setSending] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [sent, setSent] = useState<string[]>([]);

  const members = (data?.members ?? []).filter((m) => m.is_active !== false);
  const invites = data?.pendingInvites ?? [];
  const invitedSomeone = members.length > 1 || invites.length > 0;

  const send = async () => {
    const { valid, invalid } = parseEmails(emails);
    const next: string[] = invalid.map((e) => `${e} doesn't look like an email.`);
    if (!valid.length) {
      setProblems(next.length ? next : ["Add at least one email."]);
      return;
    }
    setSending(true);
    setProblems([]);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const ok: string[] = [];
    for (const email of valid) {
      const res = await fetch("/api/organisations/members", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", ...csrf },
        body: JSON.stringify({ email, role }),
      }).catch(() => null);
      if (res?.ok) ok.push(email);
      else {
        const body = (await res?.json().catch(() => null)) as { error?: string } | null;
        next.push(`${email}: ${body?.error ?? "couldn't send the invite"}.`);
      }
    }
    setSending(false);
    setSent(ok);
    setProblems(next);
    setEmails(next.length ? invalid.join(", ") : "");
    await refetch({ silent: true });
  };

  return (
    <SetupFrame
      sig="Your team"
      title={invitedSomeone ? "Your team is on its way." : "Invite your team."}
      lede="Add the people who hire with you. Each gets an email to join, and only sees the work that's theirs."
      done={invitedSomeone}
    >
      <section className="wd-panel you wd-stack" style={{ gap: 18 }} aria-label="Invite people">
        <label className="wd-stack" style={{ gap: 6 }}>
          <span className="wd-small wd-muted">Emails — paste as many as you like</span>
          <textarea
            className="wd-textarea"
            rows={2}
            style={{ minHeight: 0, height: 64 }}
            value={emails}
            placeholder="priya@company.com, arjun@company.com"
            onChange={(e) => setEmails(e.target.value)}
          />
        </label>

        <fieldset className="wd-stack" style={{ gap: 8, border: 0, margin: 0, padding: 0 }}>
          <legend className="wd-small wd-muted" style={{ marginBottom: 8 }}>
            They&apos;ll join as
          </legend>
          <div className="wd-choices">
            {ROLES.filter((r) => r.role !== "leadership" || user?.role !== "recruiter").map((r) => (
              <label key={r.role} className={`wd-choice ${role === r.role ? "on" : ""}`}>
                <input
                  type="radio"
                  name="role"
                  value={r.role}
                  checked={role === r.role}
                  onChange={() => setRole(r.role)}
                />
                <span style={{ display: "block", fontSize: 15 }}>{r.name}</span>
                <span className="wd-src" style={{ display: "block", marginTop: 2 }}>
                  {r.does}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="wd-row-actions">
          <button
            type="button"
            className="wd-btn go"
            disabled={sending || !emails.trim()}
            onClick={() => void send()}
          >
            {sending ? "Sending…" : "Send invites"}
          </button>
          {sent.length > 0 && !sending && (
            <span role="status" className="wd-small" style={{ color: "var(--wd-good)" }}>
              {sent.length === 1 ? `Invite sent to ${sent[0]}.` : `${sent.length} invites sent.`}
            </span>
          )}
        </div>
        {problems.length > 0 && (
          <ul role="alert" className="wd-problem" style={{ margin: 0, paddingLeft: 18 }}>
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </section>

      {loading && !data ? (
        <p role="status" className="wd-muted">
          Loading your team…
        </p>
      ) : error ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your team. Reload to try again.
        </p>
      ) : (
        <section className="wd-stack" style={{ gap: 8 }} aria-labelledby="team-list">
          <h2 id="team-list" className="wd-h2">
            {members.length} {members.length === 1 ? "person" : "people"} here
            {invites.length ? `, ${invites.length} invited` : ""}
          </h2>
          <ul className="wd-lines" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {members.map((m) => (
              <li
                key={m.id}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
              >
                <span>
                  <span style={{ display: "block" }}>
                    {m.full_name}
                    {m.id === user?.id ? " (you)" : ""}
                  </span>
                  {m.email && (
                    <span className="wd-src" style={{ display: "block" }}>
                      {m.email}
                    </span>
                  )}
                </span>
                <span className="wd-small wd-muted">
                  {nameFor(m.role)}
                  {m.is_org_admin ? " · admin" : ""}
                </span>
              </li>
            ))}
            {invites.map((i) => (
              <li
                key={i.id}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}
              >
                <span>
                  <span style={{ display: "block" }}>{i.email}</span>
                  <span className="wd-src" style={{ display: "block" }}>
                    Invited — hasn&apos;t joined yet
                  </span>
                </span>
                <span className="wd-small wd-muted">{nameFor(i.role)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </SetupFrame>
  );
}
