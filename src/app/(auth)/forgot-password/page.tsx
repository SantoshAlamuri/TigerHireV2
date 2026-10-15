"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useToast } from "@/components/ui/Toast";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);

    try {
      const csrfHeaders = await buildCsrfHeaders();
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });

      const data = await res.json();

      if (!res.ok) {
        toast({
          title: "Couldn't send reset link",
          description: data.error ?? "Something went wrong. Please try again.",
          tone: "error",
        });
        return;
      }

      setSent(true);
      toast({
        title: "Reset link sent",
        description: "Check your inbox and spam folder for password reset instructions.",
        tone: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description: "Please check your connection and try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 sm:px-8 sm:py-12">
      <div className="orb left-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
      <div className="orb right-1/4 bottom-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <div className="card-lifted p-8">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />

          {sent ? (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 size={20} />
                <h1 className="heading-section text-xl text-emerald-300">Check your email</h1>
              </div>
              <p className="mt-3 text-body text-sm text-white/60">
                If an account exists for{" "}
                <span className="font-medium text-[var(--text)]">{email}</span>, we&apos;ve sent a
                password reset link. Check your inbox and spam folder.
              </p>
              <p className="mt-4 text-body text-xs text-white/60">
                The link will expire in 1 hour. If you don&apos;t receive it, you can request
                another one.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setSent(false);
                    setEmail("");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/[0.06]"
                >
                  <Mail size={16} />
                  Try a different email
                </button>
                <Link
                  href="/login"
                  className="flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
                >
                  <ArrowLeft size={16} />
                  Back to sign in
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="heading-section mt-4 text-2xl text-[var(--text)]">
                Reset your password
              </h1>
              <p className="mt-1 text-body text-sm text-white/60">
                Enter the email address associated with your account and we&apos;ll send you a link
                to reset your password.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className="mb-1.5 block text-sm font-normal text-white/65">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                    required
                    autoFocus
                    disabled={submitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="hover-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                  {submitting ? "Sending..." : "Send reset link"}
                </button>
              </form>

              <p className="mt-4 text-center text-sm text-white/60">
                Remember your password?{" "}
                <Link
                  href="/login"
                  className="font-medium text-white/65 transition hover:text-white"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
