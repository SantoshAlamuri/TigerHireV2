"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useApiQuery } from "@/lib/hooks/use-api";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";

export default function WaitlistPage() {
  const [email, setEmail] = useState("");
  const [type, setType] = useState<"company" | "candidate">("company");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const { data: countData, refetch: refetchCount } = useApiQuery<{ count?: number }>(
    "/api/waitlist/count",
  );
  const count = countData && typeof countData.count === "number" ? countData.count : null;
  const prevStatus = useRef(status);

  useEffect(() => {
    if (prevStatus.current !== "success" && status === "success") {
      void refetchCount({ silent: true });
    }
    prevStatus.current = status;
  }, [status, refetchCount]);

  const whatsappHref = useMemo(
    () =>
      getPublicWhatsAppChatUrl(
        type === "company"
          ? publicWhatsAppPrefill.waitlistCompany
          : publicWhatsAppPrefill.waitlistCandidate,
      ),
    [type],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
      setStatus("success");
      setEmail("");
    } catch {
      setStatus("error");
      setMessage("We couldn’t add you right now. Please try joining via WhatsApp instead.");
    }
  }

  return (
    <div className="grain relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <div className="orb -left-20 top-40 z-0 h-[260px] w-[260px] bg-amber-500/25" aria-hidden />

      <header className="relative z-10 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur-sm">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:py-5">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
          <Link
            href="/"
            className="text-sm text-[var(--text-muted)] transition hover:text-[var(--text)]"
          >
            Back to home
          </Link>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-lg px-4 py-16 md:py-20">
        <h1 className="heading-page text-3xl text-[var(--text)] md:text-4xl lg:text-5xl">
          TigerHire is live. AI-powered hiring that actually works.
        </h1>
        <p className="mt-5 text-lead text-lg text-[var(--text-muted)]">
          TigerHire scores every CV against your JD — with plain-English explanations. Sign up for
          early access or reach out for a demo.
        </p>

        {status === "success" ? (
          <div className="mt-10 flex flex-col items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-10 text-center">
            <CheckCircle2 size={44} className="text-emerald-400" aria-hidden />
            <p className="mt-4 text-lg font-semibold text-[var(--text)]">You&apos;re on the list</p>
            <p className="mt-2 max-w-sm text-sm text-[var(--text-muted)]">
              We&apos;ll email you with access details shortly. Nothing else you need to do right
              now.
            </p>
            <p className="mt-3 max-w-sm text-xs text-[var(--text-subtle)]">
              TigerHire is live — we&apos;ll reach out with your access details shortly.
            </p>
            <Link
              href="/"
              className="mt-8 text-sm font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
            >
              Back to home
            </Link>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="mt-10 space-y-6">
              <div>
                <label htmlFor="type" className="block text-sm font-semibold text-[var(--text)]">
                  I am a…
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as "company" | "candidate")}
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                >
                  <option value="company">Company / Recruiter</option>
                  <option value="candidate">Job seeker</option>
                </select>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-[var(--text)]">
                  {type === "company" ? "Work email" : "Email or phone"}
                </label>
                <input
                  id="email"
                  type="text"
                  placeholder={type === "company" ? "you@company.com" : "you@email.com or +91..."}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-[var(--text)] placeholder:text-[var(--text-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                />
              </div>
              <button
                type="submit"
                disabled={status === "loading"}
                className="w-full rounded-full bg-[var(--accent)] py-4 font-semibold text-black transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_24px_var(--glow)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {status === "loading"
                  ? "Adding…"
                  : type === "company"
                    ? "Get early access for companies"
                    : "Get found by companies hiring now"}
              </button>
            </form>

            {status === "error" && <p className="mt-6 text-red-400">{message}</p>}

            <p className="mt-10 text-center text-sm text-[var(--text-muted)]">
              Prefer WhatsApp?{" "}
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
              >
                Join via WhatsApp — we&apos;ll open a draft you can send
              </a>
            </p>
          </>
        )}

        <p className="mt-14 text-center text-sm text-[var(--text-subtle)]">
          {count !== null ? (
            <>
              <strong className="text-[var(--text-muted)]">{count}+</strong> HR leaders and
              candidates already on the list.
            </>
          ) : (
            "HR leaders and candidates are already joining. Get on the list today."
          )}
        </p>
      </main>
    </div>
  );
}
