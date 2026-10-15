"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toUserFacingAuthError } from "@/lib/auth/sanitize-auth-error";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import type { OAuthSsoProvider } from "@/lib/auth/oauth-sso-providers";
import { LogIn, Loader2, User, RefreshCw, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import TigerHireLogo from "@/components/TigerHireLogo";

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "Sign-in failed. Please try again or use a different method.",
  missing_code: "Something went wrong during sign-in. Please try again.",
  access_denied: "Access was denied. Please try again.",
  sso_required: "Your organisation requires SSO. Use Google or LinkedIn sign-in below.",
};

const TEST_ACCOUNTS = [
  { label: "Super Admin", email: "sam@tigerhire.io" },
  { label: "Admin (platform)", email: "admin@tigerhire.com" },
  { label: "Company Admin", email: "nidhi.gupta@finstack.in" },
  { label: "Recruiter", email: "rajiv.menon@finstack.in" },
  { label: "Hiring Manager", email: "kavita.rao@finstack.in" },
  { label: "Employee", email: "meera.nair@finstack.in" },
  { label: "Interviewer", email: "lakshmi.interviewer@finstack.in" },
  { label: "Finance", email: "lakshmi.finance@finstack.in" },
  { label: "Agency", email: "fatima.sheikh@talentbridge.co" },
  { label: "Candidate Pro", email: "priya.sharma@gmail.com" },
  { label: "Candidate Free", email: "siddharth.patil@outlook.com" },
];

export default function LoginClient() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [urlErrorMessage, setUrlErrorMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [isDev, setIsDev] = useState(process.env.NODE_ENV === "development");
  const [seedStatus, setSeedStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [seedMessage, setSeedMessage] = useState("");
  const [testLoginConfigured, setTestLoginConfigured] = useState<boolean | null>(null);
  const [useDirectGoogle, setUseDirectGoogle] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const urlError = searchParams.get("error");
    if (urlError) {
      setUrlErrorMessage(
        AUTH_ERROR_MESSAGES[urlError] ?? "Something went wrong. Please try signing in again.",
      );
    }
  }, [searchParams]);

  // Check if test-login is available (local dev or Vercel preview with SEED_DEMO_PASSWORD; never production)
  useEffect(() => {
    fetch("/api/auth/oauth-config", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.useDirectGoogle === true) setUseDirectGoogle(true);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    fetch("/api/auth/test-login", { method: "GET" })
      .then((r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((data) => {
        if (data) {
          setIsDev(true);
          setTestLoginConfigured(data.configured === true);
        }
      })
      .catch(() => null);
  }, []);

  const returnToParam = searchParams.get("returnTo") ?? undefined;
  const isPublicReferralReturn = Boolean(returnToParam?.startsWith("/refer/join"));
  const hasPublicOauthHint = searchParams.get("publicOAuth") === "1";
  const requiresSso = error.toLowerCase().includes("requires sso");

  const [mode, setMode] = useState<"company" | "candidate">(
    hasPublicOauthHint || isPublicReferralReturn ? "candidate" : "company",
  );
  const isCandidateMode = mode === "candidate";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (isCandidateMode) {
      url.searchParams.set("publicOAuth", "1");
    } else {
      url.searchParams.delete("publicOAuth");
    }
    const next = url.toString();
    if (next !== window.location.href) {
      window.history.replaceState({}, "", next);
    }
  }, [isCandidateMode]);

  useEffect(() => {
    if (!urlErrorMessage) return;
    toast({
      title: "Sign-in issue",
      description: urlErrorMessage,
      tone: "warning",
    });
  }, [toast, urlErrorMessage]);

  useEffect(() => {
    if (!error) return;
    toast({
      title: "Sign-in failed",
      description: error,
      tone: "error",
    });
  }, [error, toast]);

  useEffect(() => {
    if (!seedMessage) return;
    toast({
      title: seedStatus === "success" ? "Demo users ready" : "Demo setup issue",
      description: seedMessage,
      tone: seedStatus === "success" ? "success" : "error",
    });
  }, [seedMessage, seedStatus, toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const csrfHeaders = await buildCsrfHeaders();
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          ...(returnToParam ? { returnTo: returnToParam } : {}),
        }),
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: string;
      };
      if (res.ok && data.redirectTo) {
        window.location.href = data.redirectTo;
        return;
      }
      // API already returns user-safe error messages — use them directly.
      // Only fall back to toUserFacingAuthError for unexpected messages.
      if (data.error) {
        setError(data.error);
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } catch {
      setError("Unable to connect. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSSOLogin(provider: OAuthSsoProvider) {
    setError("");
    if (provider === "google" && useDirectGoogle) {
      const u = new URL("/api/auth/google", window.location.origin);
      if (returnToParam) u.searchParams.set("redirect_to", returnToParam);
      if (isPublicReferralReturn || isCandidateMode) u.searchParams.set("flow", "public");
      window.location.href = u.toString();
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(returnToParam ? { redirect_to: returnToParam } : {}),
          ...(isPublicReferralReturn || isCandidateMode ? { flow: "public" } : {}),
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setError(toUserFacingAuthError((data as { error?: string })?.error ?? "SSO failed"));
    } catch {
      setError("Unable to connect. Please check your internet connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTestLogin(testEmail: string) {
    setError("");
    setSeedMessage("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/test-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: testEmail }),
      });

      let data;
      try {
        const text = await res.text();
        data = text ? JSON.parse(text) : {};
      } catch {
        // If response is not JSON, create error object
        data = { error: res.statusText || "Request failed" };
      }

      if (!res.ok) {
        const msg = data.error ?? "Test login failed";
        if (res.status === 503 && msg.toLowerCase().includes("not configured")) {
          setSeedStatus("error");
          setSeedMessage(
            'Test login not configured. Add SEED_DEMO_PASSWORD to .env.local, click "Setup demo users" once, then try again.',
          );
        } else if (res.status === 401) {
          setSeedMessage('Users not created yet. Click "Setup demo users" above, then try again.');
        } else {
          setError(toUserFacingAuthError(msg));
        }
        return;
      }
      if (data.redirectTo) {
        window.location.href = data.redirectTo;
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSeedDemoUsers() {
    setSeedStatus("loading");
    setSeedMessage("");
    try {
      const res = await fetch("/api/auth/seed-demo-users", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setSeedStatus("success");
        setSeedMessage(data.message ?? "Demo users ready. Try logging in.");
        setTestLoginConfigured(true);
      } else {
        setSeedStatus("error");
        setSeedMessage(data.error ?? "Seed failed");
      }
    } catch {
      setSeedStatus("error");
      setSeedMessage("Request failed");
    }
  }

  if (!mounted) {
    return (
      <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 sm:px-8 sm:py-12">
        <div className="orb left-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
        <div className="orb right-1/4 bottom-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />
        <div className="relative z-10 w-full max-w-md">
          <div className="card-lifted p-8">
            <p className="text-sm text-white/65">Loading sign in...</p>
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
          <div
            className="mt-6 grid grid-cols-2 gap-1 rounded-lg border border-white/10 bg-white/[0.03] p-1"
            role="tablist"
            aria-label="Sign in as"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!isCandidateMode}
              onClick={() => setMode("company")}
              className={`rounded-md px-4 py-2.5 text-sm font-medium transition ${
                !isCandidateMode
                  ? "bg-white/[0.10] text-white shadow-sm ring-1 ring-white/10"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Company / Vendor
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={isCandidateMode}
              onClick={() => setMode("candidate")}
              className={`rounded-md px-4 py-2.5 text-sm font-medium transition ${
                isCandidateMode
                  ? "bg-white/[0.10] text-white shadow-sm ring-1 ring-white/10"
                  : "text-white/55 hover:text-white"
              }`}
            >
              Candidate
            </button>
          </div>
          <h1 className="heading-section mt-6 text-2xl text-[var(--text)]">Welcome back</h1>
          <p className="mt-1 text-body text-sm text-white/60">
            Sign in to your account to continue.
          </p>
          {urlErrorMessage ? (
            <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
              {urlErrorMessage}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 rounded-md border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </p>
          ) : null}
          {seedStatus === "success" && seedMessage ? (
            <p className="mt-3 rounded-md border border-emerald-300/30 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-300">
              {seedMessage}
            </p>
          ) : null}

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-normal text-white/65">
                Email
              </label>
              <input
                id="email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isCandidateMode ? "you@gmail.com" : "you@company.com"}
                className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                required
                disabled={submitting}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="password" className="block text-sm font-normal text-white/65">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-white/65 transition hover:text-white"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                  required
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-white/55 transition hover:text-white"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {requiresSso && (
              <p className="text-xs text-white/60">
                Password login is disabled for your company. Continue with one of the SSO options
                below.
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="hover-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
              {submitting ? "Signing in..." : "Sign in"}
            </button>

            <div className="relative my-4">
              <span className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--border)]" />
              </span>
              <span className="relative flex justify-center text-xs text-white/60">
                or continue with
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSSOLogin("google")}
                aria-label="Continue with Google"
                title="Google"
                className="hover-lift flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-7 w-7" viewBox="0 0 24 24" aria-hidden>
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
              </button>
              {isCandidateMode ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSSOLogin("linkedin_oidc")}
                  aria-label="Continue with LinkedIn"
                  title="LinkedIn"
                  className="hover-lift flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#0A66C2] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => handleSSOLogin("azure")}
                  aria-label="Continue with Microsoft"
                  title="Microsoft"
                  className="hover-lift flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-7 w-7" viewBox="0 0 24 24" aria-hidden>
                    <path fill="#F25022" d="M1 1h10v10H1z" />
                    <path fill="#7FBA00" d="M13 1h10v10H13z" />
                    <path fill="#00A4EF" d="M1 13h10v10H1z" />
                    <path fill="#FFB900" d="M13 13h10v10H13z" />
                  </svg>
                </button>
              )}
            </div>
          </form>

          {isDev && mounted && (
            <div className="mt-6 border-t border-[var(--border)] pt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wider text-white/60">
                  Test accounts (dev only)
                </p>
                <button
                  type="button"
                  onClick={handleSeedDemoUsers}
                  disabled={seedStatus === "loading"}
                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-xs font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {seedStatus === "loading" ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  {seedStatus === "loading" ? "Setting up..." : "Setup demo users"}
                </button>
              </div>
              {testLoginConfigured === false && (
                <div className="mb-4 rounded-md border border-rose-300/30 bg-rose-400/10 p-3 text-xs text-white/90">
                  <p className="font-semibold text-rose-300">Setup required (one time)</p>
                  <p className="mt-2 text-white/65">
                    Add{" "}
                    <code className="rounded bg-white/[0.06] px-1 font-mono">
                      SEED_DEMO_PASSWORD
                    </code>{" "}
                    to <code className="rounded bg-white/[0.06] px-1 font-mono">.env.local</code>{" "}
                    and restart, or click <strong>&ldquo;Setup demo users&rdquo;</strong>.
                  </p>
                </div>
              )}
              {testLoginConfigured === true && (
                <p className="mb-3 text-xs text-emerald-300">
                  Test login is configured. Click any account below to sign in.
                </p>
              )}
              <ul className="space-y-2">
                {TEST_ACCOUNTS.map(({ label, email: testEmail }) => (
                  <li key={testEmail}>
                    <button
                      type="button"
                      onClick={() => handleTestLogin(testEmail)}
                      disabled={submitting}
                      className="hover-lift flex w-full items-center gap-3 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left text-sm text-white transition hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <User size={16} className="shrink-0 text-white/55" />
                      <span className="flex-1 font-medium">{label}</span>
                      <span className="truncate text-xs text-white/55">{testEmail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-4 text-center text-sm text-white/60">
            Don&apos;t have an account?{" "}
            <Link
              href={
                returnToParam
                  ? `/register?returnTo=${encodeURIComponent(returnToParam)}`
                  : "/register"
              }
              className="font-medium text-white/65 transition hover:text-white"
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
