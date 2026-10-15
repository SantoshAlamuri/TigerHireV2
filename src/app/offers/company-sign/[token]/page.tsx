"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type CompanySignBootstrap =
  | { gate: "dead"; statusLabel: string; message: string }
  | { gate: "done"; message: string }
  | {
      gate: "sign";
      roleTitle: string;
      companyName: string | null;
      signerName: string;
      documentHtml: string;
      expiresAt: string | null;
    };

function formatIst(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function CompanySignOfferPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<CompanySignBootstrap | null>(null);
  const [signerName, setSignerName] = useState("");

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setNotice(null);
      const response = await fetch(`/api/offers/company-sign/${token}`, { credentials: "include" });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Could not load this signature link.");
        setBootstrap(null);
        setLoading(false);
        return;
      }

      const gate = String(payload.gate ?? "");
      if (gate === "dead") {
        setBootstrap({
          gate: "dead",
          statusLabel: String(payload.statusLabel ?? "Unavailable"),
          message: String(payload.message ?? "This signature link is not available."),
        });
      } else if (gate === "done") {
        setBootstrap({
          gate: "done",
          message: String(payload.message ?? "Company signature is already complete."),
        });
      } else if (gate === "sign") {
        const initialSigner = String(payload.signerName ?? "");
        setSignerName(initialSigner);
        setBootstrap({
          gate: "sign",
          roleTitle: String(payload.roleTitle ?? "Offer"),
          companyName: (payload.companyName as string | null) ?? null,
          signerName: initialSigner,
          documentHtml: String(payload.documentHtml ?? ""),
          expiresAt: (payload.expiresAt as string | null) ?? null,
        });
      } else {
        setNotice("Could not load this signature link.");
        setBootstrap(null);
      }
      setLoading(false);
    })();
  }, [token]);

  async function submitSign() {
    const name = signerName.trim();
    if (!name) {
      setNotice("Please type your full name.");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/company-sign/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signer_name: name }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice(payload.error ?? "Could not complete signature.");
        return;
      }
      setBootstrap({
        gate: "done",
        message: "Company signature recorded. The candidate has been invited to sign next.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-[var(--text-muted)]">Loading signature request...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      {notice ? (
        <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-muted)]">
          {notice}
        </p>
      ) : null}

      {bootstrap?.gate === "dead" ? (
        <section className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
          <h1 className="text-xl font-semibold text-[var(--text)]">{bootstrap.statusLabel}</h1>
          <p className="text-sm text-[var(--text-muted)]">{bootstrap.message}</p>
        </section>
      ) : null}

      {bootstrap?.gate === "done" ? (
        <section className="space-y-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <h1 className="text-xl font-semibold text-[var(--text)]">Signature complete</h1>
          <p className="text-sm text-[var(--text)]">{bootstrap.message}</p>
        </section>
      ) : null}

      {bootstrap?.gate === "sign" ? (
        <div className="space-y-4">
          <header className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {bootstrap.companyName ?? "Employer"}
            </p>
            <h1 className="text-xl font-semibold text-[var(--text)]">{bootstrap.roleTitle}</h1>
            {bootstrap.expiresAt ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Signature link expires {formatIst(bootstrap.expiresAt)} (IST)
              </p>
            ) : null}
          </header>

          <article
            className="rounded-2xl border border-[var(--border)] bg-white p-4 text-[var(--text)] shadow-sm dark:bg-zinc-900"
            dangerouslySetInnerHTML={{ __html: bootstrap.documentHtml }}
          />

          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
            <p className="text-sm text-[var(--text)]">
              By typing your full name below and clicking Sign as company representative, you
              confirm this offer is approved for candidate signature.
            </p>
            <label
              className="block text-xs font-medium text-[var(--text-muted)]"
              htmlFor="company-signer-name"
            >
              Type your full name
            </label>
            <input
              id="company-signer-name"
              autoComplete="name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitSign()}
              className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {submitting ? "Working…" : "Sign as company representative"}
            </button>
          </section>
        </div>
      ) : null}
    </main>
  );
}
