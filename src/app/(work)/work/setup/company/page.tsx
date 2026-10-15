"use client";

import { Suspense, useEffect, useState } from "react";
import { useApiQuery } from "@/lib/hooks/use-api";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import { SetupFrame } from "@/components/work/setup/SetupFrame";

interface Org {
  id: string;
  name: string | null;
  email_domain: string | null;
  enforce_2fa?: boolean | null;
}

/** "jane@acme.com", "@acme.com" or "ACME.com " all become "acme.com". */
function domainOf(value: string): string {
  const v = value.trim().toLowerCase();
  return (v.includes("@") ? (v.split("@").pop() ?? "") : v).replace(/^@+/, "").trim();
}

export default function CompanySetupPage() {
  return (
    <Suspense fallback={null}>
      <CompanySetup />
    </Suspense>
  );
}

/** Your company: the name people see, and the email domain that proves someone works there. */
function CompanySetup() {
  const { data, loading, error, refetch } = useApiQuery<{ organisation?: Org }>(
    "/api/organisations",
  );
  const org = data?.organisation;
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    setName(org?.name ?? "");
    setDomain(org?.email_domain ?? "");
  }, [org?.name, org?.email_domain]);

  const changed =
    !!org && (name.trim() !== (org.name ?? "") || domainOf(domain) !== (org.email_domain ?? ""));

  const save = async () => {
    if (name.trim().length < 2) return setProblem("The company name needs at least two letters.");
    setSaving(true);
    setProblem(null);
    const csrf = await buildCsrfHeaders().catch(() => ({}));
    const res = await fetch("/api/organisations", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...csrf },
      body: JSON.stringify({ name: name.trim(), email_domain: domainOf(domain) }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      return setProblem(body?.error ?? "Couldn't save. Try again.");
    }
    setSaved(true);
    setDomain(domainOf(domain));
    await refetch({ silent: true });
  };

  return (
    <SetupFrame
      sig="Your company"
      title={org?.name ? org.name : "Your company."}
      lede="The name candidates and your team see, and the work email domain that lets colleagues join as referrers without a check."
    >
      {loading && !data ? (
        <p role="status" className="wd-muted">
          Loading your company…
        </p>
      ) : error || !org ? (
        <p role="alert" className="wd-problem">
          Couldn&apos;t load your company. Reload to try again.
        </p>
      ) : (
        <section className="wd-panel wd-stack" style={{ gap: 22 }} aria-label="Company details">
          <label className="wd-stack" style={{ gap: 6 }}>
            <span className="wd-small wd-muted">Company name</span>
            <input
              id="company-name"
              className="wd-input"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="wd-stack" style={{ gap: 6 }}>
            <span className="wd-small wd-muted">Work email domain</span>
            <input
              id="company-domain"
              className="wd-input"
              placeholder="yourcompany.com"
              value={domain}
              onChange={(e) => {
                setDomain(e.target.value);
                setSaved(false);
              }}
            />
            <span className="wd-src">
              Anyone signing up with an @{domainOf(domain) || "yourcompany.com"} address is treated
              as a colleague.
            </span>
          </label>
          <div className="wd-line" style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
            <span>
              <span style={{ display: "block" }}>Two-step sign-in for everyone</span>
              <span className="wd-src" style={{ display: "block" }}>
                Coming soon. It stays off until authenticator set-up is ready, so nobody gets locked
                out.
              </span>
            </span>
            <button type="button" className="wd-toggle" aria-pressed={!!org.enforce_2fa} disabled>
              <span className="sr-only">Two-step sign-in</span>
            </button>
          </div>
          <div className="wd-row-actions">
            <button
              type="button"
              className="wd-btn go"
              disabled={saving || !changed}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && !changed && (
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
      )}
    </SetupFrame>
  );
}
