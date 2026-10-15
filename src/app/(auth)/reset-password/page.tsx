"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Lock, Loader2, CheckCircle2, Eye, EyeOff } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import { useToast } from "@/components/ui/Toast";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { clearLocationHash, parseRecoveryHash } from "@/lib/auth/recovery-hash";

export default function ResetPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = useMemo(
    () => (isSupabaseConfigured() ? createSupabaseBrowserClient() : null),
    [],
  );

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setHasSession(false);
      return;
    }
    let cancelled = false;
    const adopt = (session: Session | null) => {
      if (cancelled) return;
      setHasSession(!!session);
      setSessionEmail(session?.user?.email ?? null);
    };

    // Belt and braces: if the client library does consume the link itself, it
    // announces the recovery session here.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (event === "PASSWORD_RECOVERY" && session) adopt(session);
    });

    (async () => {
      // The reset link lands with the session in the hash fragment (implicit
      // flow). The PKCE browser client will not touch it, so adopt it by hand.
      const fromLink = parseRecoveryHash(window.location.hash);
      if (fromLink.kind === "tokens") {
        const { data, error } = await supabase.auth.setSession({
          access_token: fromLink.accessToken,
          refresh_token: fromLink.refreshToken,
        });
        clearLocationHash();
        if (!error && data.session) {
          adopt(data.session);
          return;
        }
      } else if (fromLink.kind === "error") {
        // e.g. otp_expired — Supabase reports link problems in the fragment too.
        clearLocationHash();
        adopt(null);
        return;
      }
      const { data } = await supabase.auth.getSession();
      adopt(data.session);
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      toast({
        title: "Password mismatch",
        description: "Passwords do not match.",
        tone: "error",
      });
      return;
    }

    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Password must be at least 8 characters.",
        tone: "error",
      });
      return;
    }

    if (!supabase) {
      toast({
        title: "Configuration issue",
        description: "Supabase is not configured.",
        tone: "error",
      });
      return;
    }

    setSubmitting(true);

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        const msg = updateError.message.toLowerCase();
        if (msg.includes("same password")) {
          toast({
            title: "Choose a different password",
            description: "New password must be different from your current password.",
            tone: "error",
          });
        } else if (msg.includes("weak") || msg.includes("short")) {
          toast({
            title: "Weak password",
            description: "Password is too weak. Please choose a stronger password.",
            tone: "error",
          });
        } else {
          toast({
            title: "Couldn't update password",
            description: "Please try again or request a new reset link.",
            tone: "error",
          });
        }
        return;
      }

      setSuccess(true);
      toast({
        title: "Password updated",
        description: "You can now sign in with your new password.",
        tone: "success",
      });
      setTimeout(() => router.push("/login"), 3000);
    } catch {
      toast({
        title: "Reset failed",
        description: "Something went wrong. Please try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (hasSession === null) {
    return (
      <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 sm:px-8 sm:py-12">
        <div className="w-full max-w-md">
          <div className="card-lifted p-8">
            <div className="flex items-center gap-2 text-sm text-white/65">
              <Loader2 size={14} className="animate-spin" />
              Checking reset link...
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 sm:px-8 sm:py-12">
      <div className="orb left-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
      <div className="orb right-1/4 bottom-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <div className="card-lifted p-8">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />

          {success ? (
            <div className="mt-6">
              <div className="flex items-center gap-2 text-emerald-300">
                <CheckCircle2 size={20} />
                <h1 className="heading-section text-xl text-emerald-300">Password updated</h1>
              </div>
              <p className="mt-3 text-body text-sm text-white/60">
                Your password has been reset successfully. Redirecting you to sign in...
              </p>
              <Link
                href="/login"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
              >
                Sign in now
              </Link>
            </div>
          ) : !hasSession ? (
            <div className="mt-6">
              <h1 className="heading-section text-xl text-[var(--text)]">
                Invalid or expired link
              </h1>
              <p className="mt-3 text-body text-sm text-white/60">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)]"
              >
                Request new reset link
              </Link>
            </div>
          ) : (
            <>
              <h1 className="heading-section mt-4 text-2xl text-[var(--text)]">
                Set a new password
              </h1>
              {sessionEmail && (
                <p className="mt-2 text-body text-sm text-white/60">
                  Resetting password for{" "}
                  <span className="font-medium text-[var(--text)]">{sessionEmail}</span>
                </p>
              )}
              <p className="mt-1 text-body text-sm text-white/60">
                Enter your new password below. It must be at least 8 characters.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-normal text-white/65"
                  >
                    New password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter new password"
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                      required
                      minLength={8}
                      autoFocus
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/55 transition hover:text-white"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirm"
                    className="mb-1.5 block text-sm font-normal text-white/65"
                  >
                    Confirm new password
                  </label>
                  <input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Confirm new password"
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                    required
                    minLength={8}
                    disabled={submitting}
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="hover-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  {submitting ? "Updating..." : "Update password"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
