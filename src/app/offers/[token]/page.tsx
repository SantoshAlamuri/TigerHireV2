"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CompensationTable } from "@/components/offers/CompensationTable";

type PublicOfferSummary = {
  id: string;
  roleTitle: string;
  companyName: string | null;
  startDate: string | null;
  compensation: Record<string, unknown> | null;
  notes: string | null;
  status: string;
  statusLabel: string;
  canRespond: boolean;
};

type NativeBootstrap = {
  gate: "native";
  companyName: string | null;
  roleTitle: string;
  documentHtml: string;
  expiresAt: string | null;
  signingStatus: string;
  statusLabel: string;
};

type SignedBootstrap = {
  gate: "signed";
  companyName: string | null;
  roleTitle: string;
  signerName: string;
  signedAt: string | null;
  downloadUrl: string;
};

export default function PublicOfferPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token ?? "";

  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<
    | { gate: "dead"; statusLabel: string; message: string }
    | { gate: "otp"; roleTitle: string; companyName: string | null; statusLabel: string }
    | { gate: "view"; summary: PublicOfferSummary }
    | NativeBootstrap
    | SignedBootstrap
    | null
  >(null);

  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpStep, setOtpStep] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [summary, setSummary] = useState<PublicOfferSummary | null>(null);

  const [signerName, setSignerName] = useState("");
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [counterOpen, setCounterOpen] = useState(false);
  const [counterComment, setCounterComment] = useState("");
  const viewedRef = useRef(false);

  useEffect(() => {
    if (!token) return;
    viewedRef.current = false;
    (async () => {
      setLoading(true);
      setNotice(null);
      const response = await fetch(`/api/offers/public/${token}`, { credentials: "include" });
      const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & {
        error?: string;
        gate?: string;
        message?: string;
        statusLabel?: string;
        roleTitle?: string;
        companyName?: string | null;
        summary?: PublicOfferSummary;
        documentHtml?: string;
        expiresAt?: string | null;
        signingStatus?: string;
        signerName?: string;
        signedAt?: string | null;
        downloadUrl?: string;
      };
      if (!response.ok) {
        setNotice((payload.error as string) ?? "Offer link not found");
        setBootstrap(null);
        setLoading(false);
        return;
      }
      if (payload.gate === "dead") {
        setBootstrap({
          gate: "dead",
          statusLabel: String(payload.statusLabel ?? ""),
          message: String(payload.message ?? "This offer is no longer available."),
        });
        setLoading(false);
        return;
      }
      if (payload.gate === "signed") {
        setBootstrap({
          gate: "signed",
          companyName: (payload.companyName as string | null) ?? null,
          roleTitle: String(payload.roleTitle ?? "Offer"),
          signerName: String(payload.signerName ?? "Candidate"),
          signedAt: (payload.signedAt as string | null) ?? null,
          downloadUrl: String(payload.downloadUrl ?? `/api/offers/public/${token}/download`),
        });
        setLoading(false);
        return;
      }
      if (payload.gate === "native") {
        setBootstrap({
          gate: "native",
          companyName: (payload.companyName as string | null) ?? null,
          roleTitle: String(payload.roleTitle ?? "Offer"),
          documentHtml: String(payload.documentHtml ?? ""),
          expiresAt: (payload.expiresAt as string | null) ?? null,
          signingStatus: String(payload.signingStatus ?? "sent"),
          statusLabel: String(payload.statusLabel ?? ""),
        });
        setLoading(false);
        return;
      }
      if (payload.gate === "view" && payload.summary) {
        setSummary(payload.summary);
        setBootstrap({ gate: "view", summary: payload.summary });
        setLoading(false);
        return;
      }
      if (payload.gate === "otp") {
        setBootstrap({
          gate: "otp",
          roleTitle: String(payload.roleTitle ?? "Offer"),
          companyName: (payload.companyName as string | null) ?? null,
          statusLabel: String(payload.statusLabel ?? ""),
        });
        setLoading(false);
        return;
      }
      setNotice("Unable to load this offer.");
      setLoading(false);
    })();
  }, [token]);

  useEffect(() => {
    if (!token || bootstrap?.gate !== "native" || viewedRef.current) return;
    viewedRef.current = true;
    void fetch(`/api/offers/public/${token}/view`, { method: "POST", credentials: "include" });
  }, [token, bootstrap?.gate]);

  async function requestOtp() {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/public/${token}/otp/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.status === 429) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setNotice(payload.error ?? "Too many requests.");
        return;
      }
      setOtpStep(true);
      setNotice("If this email matches the offer, a verification code was sent.");
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp() {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/public/${token}/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otp_code: otpCode.trim() }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        summary?: PublicOfferSummary;
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Invalid code.");
        return;
      }
      if (payload.summary) {
        setSummary(payload.summary);
        setBootstrap({ gate: "view", summary: payload.summary });
        setOtpStep(false);
        setNotice(null);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function submitResponse(kind: "accept" | "decline" | "counter", comment?: string | null) {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/public/${token}/response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ response: kind, comment: comment ?? null }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        offer?: { status?: string };
      };
      if (!response.ok) {
        setNotice(payload.error ?? "Could not submit response.");
        return;
      }
      const st = payload.offer?.status;
      if (st && summary) {
        setSummary({
          ...summary,
          status: st,
          statusLabel:
            st === "accepted"
              ? "Accepted"
              : st === "declined"
                ? "Declined"
                : st === "negotiating"
                  ? "Counter-offer under review"
                  : st === "pending_admin" || st === "pending_finance"
                    ? "Under review"
                    : summary.statusLabel,
          canRespond: false,
        });
      }
      setCounterOpen(false);
      setNotice(
        kind === "accept"
          ? "You have accepted this offer."
          : kind === "decline"
            ? "You have declined this offer."
            : "Your counter-offer has been submitted for review.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSign() {
    const name = signerName.trim();
    if (!name) {
      setNotice("Please type your full name.");
      return;
    }
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/public/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ signer_name: name }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        signed_at?: string;
      };
      if (!response.ok) {
        setNotice((payload.error as string) ?? "Could not sign offer.");
        return;
      }
      const signedAt = payload.signed_at ?? null;
      setBootstrap({
        gate: "signed",
        companyName: bootstrap?.gate === "native" ? bootstrap.companyName : null,
        roleTitle: bootstrap?.gate === "native" ? bootstrap.roleTitle : "Offer",
        signerName: name,
        signedAt,
        downloadUrl: `/api/offers/public/${token}/download`,
      });
      setNotice(null);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitDecline() {
    setSubmitting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/offers/public/${token}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setNotice((payload.error as string) ?? "Could not decline offer.");
        return;
      }
      setBootstrap({
        gate: "dead",
        statusLabel: "Declined",
        message: "You have already declined this offer.",
      });
      setDeclineOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

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

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-[var(--text-muted)]">Loading offer...</p>
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

      {bootstrap?.gate === "signed" ? (
        <section className="space-y-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
          <div className="flex items-center gap-2 text-emerald-600">
            <span className="text-2xl" aria-hidden>
              ✓
            </span>
            <h1 className="text-xl font-semibold text-[var(--text)]">Offer accepted</h1>
          </div>
          <p className="text-sm text-[var(--text)]">
            This offer was accepted by <strong>{bootstrap.signerName}</strong>
            {bootstrap.signedAt ? (
              <>
                {" "}
                on <strong>{formatIst(bootstrap.signedAt)}</strong> (IST).
              </>
            ) : null}
          </p>
          <a
            href={bootstrap.downloadUrl}
            className="inline-flex rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Download signed copy
          </a>
          {bootstrap.companyName ? (
            <p className="text-xs text-[var(--text-muted)]">
              Questions? Contact {bootstrap.companyName}.
            </p>
          ) : null}
        </section>
      ) : null}

      {bootstrap?.gate === "native" ? (
        <div className="space-y-4">
          <header className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              {bootstrap.companyName ?? "Employer"}
            </p>
            <h1 className="text-xl font-semibold text-[var(--text)]">{bootstrap.roleTitle}</h1>
            {bootstrap.expiresAt ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Offer link expires {formatIst(bootstrap.expiresAt)} (IST)
              </p>
            ) : null}
          </header>
          <article
            className="rounded-2xl border border-[var(--border)] bg-white p-4 text-[var(--text)] shadow-sm dark:bg-zinc-900"
            dangerouslySetInnerHTML={{ __html: bootstrap.documentHtml }}
          />
          <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
            <p className="text-sm text-[var(--text)]">
              By typing your full name below and clicking Accept, you confirm you have read and
              agree to this offer of employment.
            </p>
            <label
              className="block text-xs font-medium text-[var(--text-muted)]"
              htmlFor="signer-name"
            >
              Type your full name
            </label>
            <input
              id="signer-name"
              autoComplete="name"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitSign()}
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {submitting ? "Working…" : "Accept this offer"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setDeclineOpen((v) => !v)}
                className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)]"
              >
                Decline this offer
              </button>
            </div>
            {declineOpen ? (
              <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                <p className="text-sm text-[var(--text)]">
                  Are you sure? Please tell us why{" "}
                  <span className="text-[var(--text-muted)]">(optional)</span>:
                </p>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                />
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitDecline()}
                  className="rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-200"
                >
                  Confirm decline
                </button>
              </div>
            ) : null}
            <p className="text-xs text-[var(--text-muted)]">
              This constitutes a legally binding acceptance under the Information Technology Act,
              2000.
            </p>
          </section>
        </div>
      ) : null}

      {bootstrap?.gate === "otp" && !summary ? (
        <section className="space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
          <h1 className="text-xl font-semibold text-[var(--text)]">{bootstrap.roleTitle}</h1>
          {bootstrap.companyName ? (
            <p className="text-sm text-[var(--text-muted)]">{bootstrap.companyName}</p>
          ) : null}
          <p className="text-sm text-[var(--text-muted)]">{bootstrap.statusLabel}</p>
          {!otpStep ? (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text)]">
                Enter the email address on your candidate profile to receive a code.
              </p>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <button
                type="button"
                disabled={submitting || !email.includes("@")}
                onClick={() => void requestOtp()}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {submitting ? "Sending..." : "Send verification code"}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text)]">Enter the 6-digit code from your email.</p>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
              />
              <button
                type="button"
                disabled={submitting || otpCode.trim().length < 6}
                onClick={() => void verifyOtp()}
                className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {submitting ? "Verifying..." : "Verify"}
              </button>
            </div>
          )}
        </section>
      ) : null}

      {summary && bootstrap?.gate !== "native" && bootstrap?.gate !== "signed" ? (
        <section className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/70 p-5">
          <h1 className="text-xl font-semibold text-[var(--text)]">{summary.roleTitle}</h1>
          {summary.companyName ? (
            <p className="text-sm font-medium text-[var(--text-muted)]">{summary.companyName}</p>
          ) : null}
          <p className="text-sm text-[var(--accent)]">{summary.statusLabel}</p>

          {summary.startDate ? (
            <p className="text-sm text-[var(--text)]">
              <span className="text-[var(--text-muted)]">Start date: </span>
              {new Date(summary.startDate).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
            </p>
          ) : null}

          <CompensationTable compensation={summary.compensation} />

          {summary.notes ? (
            <p className="rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text)]">
              {summary.notes}
            </p>
          ) : null}

          {summary.canRespond ? (
            <div className="space-y-3 pt-2">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitResponse("accept")}
                  className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Accept
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setCounterOpen((open) => !open);
                    setDeclineOpen(false);
                  }}
                  className="rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                >
                  Counter-offer
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void submitResponse("decline")}
                  className="rounded-full border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--text)] disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
              {counterOpen ? (
                <div className="space-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
                  <p className="text-sm text-[var(--text)]">
                    Describe your counter-offer (required):
                  </p>
                  <textarea
                    value={counterComment}
                    onChange={(e) => setCounterComment(e.target.value)}
                    rows={3}
                    placeholder="e.g. Requested CTC, start date, or other terms"
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)]"
                  />
                  <button
                    type="button"
                    disabled={submitting || !counterComment.trim()}
                    onClick={() => void submitResponse("counter", counterComment.trim())}
                    className="rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 disabled:opacity-50"
                  >
                    Submit counter-offer
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
