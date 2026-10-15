"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toUserFacingAuthError } from "@/lib/auth/sanitize-auth-error";
import { buildCsrfHeaders } from "@/lib/security/csrf-client";
import type { OAuthSsoProvider } from "@/lib/auth/oauth-sso-providers";
import { useToast } from "@/components/ui/Toast";
import {
  Building2,
  Briefcase,
  UserCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle,
  Eye,
  EyeOff,
} from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";

type RegistrationPath = "company" | "agency" | "candidate";

/**
 * sessionStorage key used to bridge `?parent=<referrer_id>` from `/refer/join`-style
 * invite links (which now redirect to `/register?referral_intent=true&parent=...`)
 * across the candidate-register → candidate-dashboard → referrer-setup hop.
 *
 * Read by `/dashboard/referrer` when the user activates "Refer & earn" so we can
 * post `parent_referrer_id` to `/api/refer/join` and preserve invite-chain
 * attribution end-to-end. Kept in sync with the constant of the same name in
 * `src/app/(dashboard)/dashboard/referrer/page.tsx`.
 */
const PENDING_PARENT_REFERRER_KEY = "th_pending_parent_referrer_id";

const PATHS: {
  key: RegistrationPath;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "company",
    label: "I'm hiring",
    sublabel: "Post jobs and find talent",
    icon: <Building2 size={28} />,
  },
  {
    key: "agency",
    label: "I'm an agency",
    sublabel: "Recruit for multiple clients",
    icon: <Briefcase size={28} />,
  },
  {
    key: "candidate",
    label: "I'm looking for work",
    sublabel: "Get matched to the right roles",
    icon: <UserCircle size={28} />,
  },
];

export default function RegisterPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<"select" | "form" | "success">("select");
  const [selectedPath, setSelectedPath] = useState<(typeof PATHS)[number] | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const returnToRaw = searchParams.get("returnTo") ?? undefined;
  const returnTo =
    returnToRaw && returnToRaw.startsWith("/") && !returnToRaw.startsWith("//")
      ? returnToRaw
      : undefined;
  const isPublicReferralReturn = Boolean(returnTo?.startsWith("/refer/join"));
  const [useDirectGoogle, setUseDirectGoogle] = useState(false);

  useEffect(() => {
    fetch("/api/auth/oauth-config", { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.useDirectGoogle === true) setUseDirectGoogle(true);
      })
      .catch(() => null);
  }, []);

  // Bridge invite-chain attribution: when a friend hits `/register?parent=<id>`
  // (via the deprecated `/refer/join` redirect or the inviteJoinUrl helper),
  // stash the parent referrer id in sessionStorage so the eventual
  // `/dashboard/referrer` setup form can include it in `/api/refer/join`.
  // Validated as a UUID before storage to avoid feeding garbage into the API.
  // "Applied via apply link → create an account" entry: apply success sends
  // /register?userType=candidate&email=... — land straight on a prefilled
  // candidate signup. The existing claim-by-email logic then links their
  // application + résumé on first login, and the candidate home routes them
  // into onboarding (which pre-fills from that résumé).
  const prefillDoneRef = useRef(false);
  useEffect(() => {
    if (prefillDoneRef.current) return;
    const emailParam = searchParams.get("email");
    const userType = searchParams.get("userType");
    if (!emailParam && userType !== "candidate") return;
    prefillDoneRef.current = true;
    if (emailParam && /.+@.+\..+/.test(emailParam)) setEmail(emailParam);
    const candidatePath = PATHS.find((p) => p.key === "candidate") ?? null;
    if (candidatePath) {
      setSelectedPath(candidatePath);
      setStep("form");
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const parent = searchParams.get("parent");
    if (!parent) return;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parent);
    if (!isUuid) return;
    try {
      window.sessionStorage.setItem(PENDING_PARENT_REFERRER_KEY, parent);
    } catch {
      // sessionStorage can throw in private modes / blocked contexts — silent
      // fallback: invite-chain attribution is lost but registration proceeds.
    }
  }, [searchParams]);

  function handleSelect(path: (typeof PATHS)[number]) {
    setSelectedPath(path);
    setStep("form");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPath) return;
    setSubmitting(true);

    try {
      const csrfHeaders = await buildCsrfHeaders();
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...csrfHeaders },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          fullName: name,
          userType: selectedPath.key,
          organisationName: selectedPath.key !== "candidate" ? orgName : undefined,
        }),
        credentials: "include",
      });

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        confirmed?: boolean;
      };

      if (!res.ok) {
        if (process.env.NODE_ENV === "development") {
          console.warn("[register] POST /api/auth/register failed", {
            status: res.status,
            error: data.error,
            body: data,
          });
        }
        toast({
          title: "Registration failed",
          description: toUserFacingAuthError(data.error ?? "Registration failed"),
          tone: "error",
        });
        setSubmitting(false);
        return;
      }

      if (data.confirmed) {
        // Auto-confirmed: sign in via server API to set session cookies, then redirect.
        const loginCsrfHeaders = await buildCsrfHeaders();
        const loginRes = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...loginCsrfHeaders },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            password,
            ...(returnTo ? { returnTo } : {}),
          }),
          credentials: "include",
        });
        const loginData = (await loginRes.json().catch(() => ({}))) as {
          redirectTo?: string;
        };
        if (loginRes.ok && loginData.redirectTo) {
          window.location.href = loginData.redirectTo;
          return;
        }
        // Login after registration failed — show success and let them sign in manually.
      }

      setEmailConfirmed(data.confirmed === true);
      setSuccessMessage(
        data.message ?? "Registration successful. Please check your email to verify your account.",
      );
      setStep("success");
      toast({
        title: "Account created",
        description: data.confirmed
          ? "Your account is ready. Sign in to continue."
          : "Check your email to verify your account before signing in.",
        tone: "success",
      });
    } catch {
      toast({
        title: "Network issue",
        description: "Unable to connect. Please check your connection and try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSSOSignup(provider: OAuthSsoProvider) {
    if (!selectedPath) return;
    if (provider === "google" && useDirectGoogle) {
      const u = new URL("/api/auth/google", window.location.origin);
      if (returnTo) u.searchParams.set("redirect_to", returnTo);
      const isPublic = selectedPath.key === "candidate" || isPublicReferralReturn;
      if (isPublic) u.searchParams.set("flow", "public");
      window.location.href = u.toString();
      return;
    }
    setSubmitting(true);
    try {
      const flow =
        selectedPath.key === "candidate" || isPublicReferralReturn ? "public" : undefined;
      const res = await fetch("/api/auth/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          ...(returnTo ? { redirect_to: returnTo } : {}),
          ...(flow ? { flow } : {}),
        }),
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      toast({
        title: "SSO sign-up failed",
        description: toUserFacingAuthError((data as { error?: string })?.error ?? "SSO failed"),
        tone: "error",
      });
    } catch {
      toast({
        title: "Network issue",
        description: "Unable to connect. Please check your internet connection and try again.",
        tone: "error",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-10 sm:px-8 sm:py-12">
      <div className="orb right-1/4 top-1/3 h-[240px] w-[240px] bg-amber-500/20" aria-hidden />
      <div className="orb left-1/4 bottom-1/4 h-[180px] w-[180px] bg-amber-600/15" aria-hidden />

      <div className="relative z-10 w-full max-w-md">
        <div className="card-lifted p-8">
          <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />

          {step === "success" ? (
            <div className="mt-6 text-center">
              <CheckCircle size={48} className="mx-auto text-emerald-300" />
              <h1 className="heading-section mt-4 text-2xl text-[var(--text)]">
                {emailConfirmed ? "Account created" : "Verify your email"}
              </h1>
              <p className="mt-2 text-body text-sm text-white/60">
                {successMessage ||
                  "We sent a confirmation link to your email. Click it to activate your account."}
              </p>
              {!emailConfirmed ? (
                <p className="mt-3 text-sm text-white/60">
                  Open the verification link sent to <strong>{email.trim()}</strong>, then sign in.
                  If it has not arrived, check your spam folder.
                </p>
              ) : null}
              {selectedPath?.key === "company" ? (
                <p className="mt-3 text-sm text-white/60">
                  After verifying your email, sign in to set up your company and start hiring.
                </p>
              ) : null}
              <Link
                href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
                className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white/65 transition hover:text-white"
              >
                Back to sign in
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : step === "select" ? (
            <>
              <h1 className="heading-section mt-4 text-2xl text-[var(--text)]">
                Create your account
              </h1>
              <p className="mt-1 text-body text-sm text-white/60">
                Tell us who you are so we can set up the right experience.
              </p>
              <div className="mt-6 space-y-3">
                {PATHS.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleSelect(p)}
                    className="group flex w-full items-center gap-4 rounded-md border border-white/10 bg-white/[0.04] p-4 text-left transition hover:bg-white/[0.06]"
                  >
                    <span className="text-[var(--accent)]">{p.icon}</span>
                    <div className="flex-1">
                      <p className="heading-card text-sm text-[var(--text)]">{p.label}</p>
                      <p className="text-xs text-white/55">{p.sublabel}</p>
                    </div>
                    <ArrowRight
                      size={16}
                      className="text-white/55 transition group-hover:text-white"
                    />
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep("select")}
                className="mt-4 flex items-center gap-1.5 text-sm text-white/65 transition hover:text-white"
              >
                <ArrowLeft size={14} />
                Back
              </button>
              <h1 className="heading-section mt-3 text-2xl text-[var(--text)]">
                {selectedPath?.label}
              </h1>
              <p className="mt-1 text-body text-sm text-white/60">
                {selectedPath?.key === "company"
                  ? "Create a new company workspace. Verify your email, then sign in to set up your team and start hiring."
                  : `${selectedPath?.sublabel}. Fill in your details to get started.`}
              </p>

              {selectedPath?.key === "company" ? (
                <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-sm text-white/65">
                  <p className="font-medium text-[var(--text)]">Joining an existing team?</p>
                  <p className="mt-1">
                    Ask your company admin for an invitation, then{" "}
                    <Link
                      className="text-[var(--accent)] underline"
                      href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
                    >
                      sign in with your work email
                    </Link>
                    .
                  </p>
                </div>
              ) : null}
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label
                    htmlFor="reg-name"
                    className="mb-1.5 block text-sm font-normal text-white/65"
                  >
                    Full name
                  </label>
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                    required
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-email"
                    className="mb-1.5 block text-sm font-normal text-white/65"
                  >
                    {selectedPath?.key === "candidate" ? "Email" : "Work email"}
                  </label>
                  <input
                    id="reg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={
                      selectedPath?.key === "candidate" ? "you@email.com" : "you@company.com"
                    }
                    className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                    required
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label
                    htmlFor="reg-password"
                    className="mb-1.5 block text-sm font-normal text-white/65"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="reg-password"
                      type={showPassword ? "text" : "password"}
                      name="new-password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min 8 characters"
                      minLength={8}
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 pr-10 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      disabled={submitting}
                      className="absolute inset-y-0 right-0 flex items-center px-3 text-white/55 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                {selectedPath?.key !== "candidate" && (
                  <div>
                    <label
                      htmlFor="reg-org"
                      className="mb-1.5 block text-sm font-normal text-white/65"
                    >
                      {selectedPath?.key === "agency" ? "Agency name" : "Company name"}
                    </label>
                    <input
                      id="reg-org"
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder={selectedPath?.key === "agency" ? "Your agency" : "Your company"}
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/20 focus:outline-none focus:ring-2 focus:ring-white/15"
                      required
                      disabled={submitting}
                    />
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="hover-lift flex w-full items-center justify-center gap-2 rounded-md bg-[var(--accent)] py-2.5 text-sm font-semibold text-black shadow-[0_0_20px_rgba(245,158,11,0.25)] transition hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {submitting ? "Creating account..." : "Create account"}
                  {!submitting && <ArrowRight size={16} />}
                </button>
                <div className="relative my-4">
                  <span className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-[var(--border)]" />
                  </span>
                  <span className="relative flex justify-center text-xs text-white/60">
                    or sign up with
                  </span>
                </div>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSSOSignup("google")}
                    aria-label="Sign up with Google"
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
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSSOSignup("linkedin_oidc")}
                    aria-label="Sign up with LinkedIn"
                    title="LinkedIn"
                    className="hover-lift flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] text-[#0A66C2] transition hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg className="h-7 w-7" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => handleSSOSignup("azure")}
                    aria-label="Sign up with Microsoft"
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
                </div>
              </form>
            </>
          )}

          {step !== "success" && (
            <p className="mt-6 text-center text-sm text-white/60">
              Already have an account?{" "}
              <Link
                href={returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login"}
                className="font-medium text-white/65 transition hover:text-white"
              >
                Sign in
              </Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
