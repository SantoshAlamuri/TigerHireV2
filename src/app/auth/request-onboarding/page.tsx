"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import TigerHireLogo from "@/components/TigerHireLogo";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";

type RequestStatus = "idle" | "loading" | "success" | "error";

const DOMAIN_PATTERN = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export default function RequestOnboardingPage() {
  const searchParams = useSearchParams();
  const domainHint = searchParams.get("domain")?.toLowerCase() ?? "";
  const nextHint = searchParams.get("next");

  const safeNext = useMemo(
    () =>
      typeof nextHint === "string" && nextHint.startsWith("/") && !nextHint.startsWith("//")
        ? nextHint
        : null,
    [nextHint],
  );

  const [fullName, setFullName] = useState("");
  const [workEmail, setWorkEmail] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [roleTitle, setRoleTitle] = useState("");
  const [domain, setDomain] = useState(DOMAIN_PATTERN.test(domainHint) ? domainHint : "");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<RequestStatus>("idle");
  const [error, setError] = useState("");

  const backToLoginHref = useMemo(() => {
    if (!safeNext || safeNext === "/") return "/login";
    return `/login?returnTo=${encodeURIComponent(safeNext)}`;
  }, [safeNext]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError("");

    try {
      const csrfHeaders = await buildCsrfHeaders();
      const response = await fetch("/api/auth/onboarding-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...csrfHeaders,
        },
        credentials: "include",
        body: JSON.stringify({
          fullName,
          workEmail,
          companyName,
          roleTitle,
          domain,
          notes,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      if (!response.ok) {
        setStatus("error");
        setError(payload.error ?? "Could not submit your request. Please try again.");
        return;
      }

      setStatus("success");
    } catch {
      setStatus("error");
      setError("Could not submit your request. Please try again.");
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="relative z-10 w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 shadow-xl backdrop-blur-sm">
        <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
        <h1 className="heading-section mt-6 text-2xl text-[var(--text)]">Request company access</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">
          Use this form if your company is not set up for work-email sign-in. Our team will review
          your details and contact you to complete company verification. All fields except notes are
          required.
        </p>

        {status === "success" ? (
          <div className="mt-6 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
            <p className="text-sm font-medium text-emerald-300">
              Request received for {companyName}.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Our onboarding team will contact you at <strong>{workEmail}</strong> about
              verification and access. Your company access is pending; submitting this form does not
              activate it.
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              You can close this page. Once setup is confirmed, sign in with the same work email.
            </p>
            <Link
              href={backToLoginHref}
              className="mt-4 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-muted)]">Full name</span>
                <input
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="Jane Doe"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-muted)]">Work email</span>
                <input
                  required
                  type="email"
                  value={workEmail}
                  onChange={(e) => setWorkEmail(e.target.value.toLowerCase())}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="you@company.com"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-muted)]">Company name</span>
                <input
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="Acme Technologies"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-[var(--text-muted)]">Your role/title</span>
                <input
                  required
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                  placeholder="HR Manager"
                />
              </label>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-muted)]">Company domain</span>
              <input
                required
                value={domain}
                onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                placeholder="company.com"
                aria-describedby="company-domain-help"
              />
              <span
                id="company-domain-help"
                className="mt-1 block text-xs text-[var(--text-subtle)]"
              >
                Enter the part after @ in your work email, for example company.com. Do not include
                https://.
              </span>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-[var(--text-muted)]">
                Additional notes <span className="text-[var(--text-subtle)]">(optional)</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
                placeholder="Anything that helps us onboard your company faster."
              />
            </label>

            {status === "error" && error ? (
              <p role="alert" className="text-sm text-rose-300">
                {error}
              </p>
            ) : null}

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={status === "loading"}
                className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {status === "loading" ? "Submitting..." : "Submit request"}
              </button>
              <Link
                href={backToLoginHref}
                className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
