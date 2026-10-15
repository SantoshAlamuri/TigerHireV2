"use client";

import { Suspense, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

interface Cover {
  id: string;
  approver_role: string;
  delegate_profile_id: string;
  starts_at: string;
  ends_at: string;
  reason?: string | null;
}

interface Member {
  id: string;
  full_name: string;
  email?: string;
  is_active?: boolean;
}

const ROLES: Record<string, string> = {
  hiring_manager: "Hiring managers",
  recruiter: "Recruiters",
  finance: "Finance",
  leadership: "Admins",
};

const day = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(iso),
  );

export default function ApprovalCoverPage() {
  return (
    <Suspense fallback={null}>
      <ApprovalCover />
    </Suspense>
  );
}

/** While someone's away, someone else approves new roles in their place, for the dates you set. */
function ApprovalCover() {
  const covers = useApiQuery<{ delegations: Cover[] }>("/api/settings/requisition-delegations");
  const team = useApiQuery<{ members: Member[] }>("/api/organisations/members");
  const people = (team.data?.members ?? []).filter((m) => m.is_active !== false);
  const nameOf = new Map(people.map((p) => [p.id, p.full_name || p.email || "Someone"]));

  const [role, setRole] = useState("finance");
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const add = async () => {
    if (!who || !from || !to) return setProblem("Pick who covers and the dates.");
    if (new Date(to) <= new Date(from))
      return setProblem("The end date needs to be after the start.");
    setBusy(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/settings/requisition-delegations", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({
        approverRole: role,
        delegateProfileId: who,
        startsAt: new Date(`${from}T00:00:00`).toISOString(),
        endsAt: new Date(`${to}T23:59:59`).toISOString(),
        reason: why.trim() || null,
      }),
    }).catch(() => null);
    setBusy(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setProblem(body?.error ?? "Couldn't add the cover. Try again.");
    }
    setWho("");
    setFrom("");
    setTo("");
    setWhy("");
    await covers.refetch({ silent: true });
  };

  const remove = async (id: string) => {
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch(`/api/settings/requisition-delegations/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: csrf,
    }).catch(() => null);
    if (!res?.ok) setProblem("Couldn't remove that cover. Try again.");
    await covers.refetch({ silent: true });
  };

  const list = covers.data?.delegations ?? [];

  return (
    <SetupFrame
      sig="Approval cover"
      title="Who approves while someone's away."
      lede="New roles never sit waiting for someone on leave. Pick whose approvals to cover, who covers them and for which dates."
    >
      <section className="wd-panel you wd-stack" style={{ gap: 18 }} aria-label="Add cover">
        <div className="wd-conn-form" style={{ padding: 0, background: "transparent" }}>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">Cover approvals from</span>
            <select
              id="cover-role"
              className="wd-input"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {Object.entries(ROLES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">Covered by</span>
            <select
              id="cover-who"
              className="wd-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
            >
              <option value="">Pick a person</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">From</span>
            <input
              id="cover-from"
              type="date"
              className="wd-input"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="wd-stack" style={{ gap: 4 }}>
            <span className="wd-small wd-muted">Until</span>
            <input
              id="cover-to"
              type="date"
              className="wd-input"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
          <label className="wd-stack" style={{ gap: 4, gridColumn: "1 / -1" }}>
            <span className="wd-small wd-muted">Why (optional)</span>
            <input
              id="cover-why"
              className="wd-input"
              placeholder="On leave"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
            />
          </label>
        </div>
        <div className="wd-row-actions">
          <button type="button" className="wd-btn go" disabled={busy} onClick={() => void add()}>
            {busy ? "Adding…" : "Add cover"}
          </button>
        </div>
        {problem && (
          <p role="alert" className="wd-problem">
            {problem}
          </p>
        )}
      </section>

      <section className="wd-group" aria-labelledby="covers-h">
        <header className="wd-group-head">
          <h2 id="covers-h" className="wd-h2">
            Cover in place
          </h2>
          <span className="wd-small wd-muted">{list.length || "None"}</span>
        </header>
        {list.length > 0 && (
          <ul className="wd-rows">
            {list.map((c) => (
              <li
                key={c.id}
                className="wd-line"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto", padding: "14px 0" }}
              >
                <span>
                  <span style={{ display: "block" }}>
                    {nameOf.get(c.delegate_profile_id) ?? "Someone"} covers{" "}
                    {ROLES[c.approver_role] ?? c.approver_role}
                  </span>
                  <span className="wd-src" style={{ display: "block" }}>
                    {day(c.starts_at)} to {day(c.ends_at)}
                    {c.reason ? ` · ${c.reason}` : ""}
                  </span>
                </span>
                <button type="button" className="wd-btn quiet" onClick={() => void remove(c.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SetupFrame>
  );
}
