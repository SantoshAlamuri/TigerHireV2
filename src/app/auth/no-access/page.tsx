import Link from "next/link";
import TigerHireLogo from "@/components/TigerHireLogo";

const REASON_COPY: Record<string, { title: string; message: string }> = {
  invalid_domain: {
    title: "Invalid work email domain",
    message: "Use your company work email to continue with SSO.",
  },
  email_missing: {
    title: "Email not returned by provider",
    message: "Your identity provider did not return an email address. Contact your IT admin.",
  },
  public_domain_blocked: {
    title: "Public email domains are not allowed",
    message: "Sign in with your company email domain to access TigerHire.",
  },
  domain_not_claimed: {
    title: "Your company has not been onboarded",
    message: "Ask your company admin to set up TigerHire SSO for your domain.",
  },
  ask_admin: {
    title: "Your company is already on TigerHire",
    message:
      "Your team already has an account. Ask your company admin to add you — they can invite you from their team settings, and we've let them know you tried to sign in.",
  },
  work_email_required: {
    title: "Use your work email",
    message:
      "Sign in with your company email address to set up or join your company. Looking for a job instead? Continue as a candidate below.",
  },
  domain_unverified: {
    title: "Company domain verification is pending",
    message: "Your company admin must finish DNS verification before SSO access can be granted.",
  },
  role_missing: {
    title: "Access is not configured yet",
    message: "Your account is missing a role. Ask your company admin to assign one.",
  },
  account_suspended: {
    title: "Your account is suspended",
    message: "Contact your company admin to reactivate access.",
  },
  provisioning_failed: {
    title: "Could not complete sign in",
    message: "Try again shortly. If this repeats, contact support.",
  },
};

export default async function NoAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ reason?: string; next?: string; domain?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const reason = typeof params.reason === "string" ? params.reason : "";
  const domain =
    typeof params.domain === "string" && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(params.domain)
      ? params.domain.toLowerCase()
      : "";
  const next =
    typeof params.next === "string" && params.next.startsWith("/") && !params.next.startsWith("//")
      ? params.next
      : "";
  const loginHref = reason === "public_domain_blocked" ? "/login?publicOAuth=1" : "/login";
  const loginHrefWithReturn = (() => {
    if (!next || next === "/") return loginHref;
    const separator = loginHref.includes("?") ? "&" : "?";
    return `${loginHref}${separator}returnTo=${encodeURIComponent(next)}`;
  })();
  const copy = REASON_COPY[reason] ?? {
    title: "You do not have access",
    message: "Your account could not be matched to an active company SSO configuration.",
  };
  const onboardingHref = (() => {
    const query = new URLSearchParams();
    if (domain) query.set("domain", domain);
    if (next && next !== "/") query.set("next", next);
    const q = query.toString();
    return q ? `/auth/request-onboarding?${q}` : "/auth/request-onboarding";
  })();

  return (
    <div className="grain relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/80 p-8 shadow-xl backdrop-blur-sm">
        <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
        <h1 className="heading-section mt-6 text-2xl text-[var(--text)]">{copy.title}</h1>
        <p className="mt-2 text-sm text-[var(--text-muted)]">{copy.message}</p>
        <div className="mt-6 flex gap-3">
          <Link
            href={loginHrefWithReturn}
            className="flex-1 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
          >
            Back to sign in
          </Link>
          <Link
            href="/"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text)] transition hover:bg-[var(--surface)]"
          >
            Go home
          </Link>
        </div>
        {reason === "domain_not_claimed" ? (
          <Link
            href={onboardingHref}
            className="mt-3 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
          >
            Request company onboarding
          </Link>
        ) : null}
        {reason === "work_email_required" ? (
          <Link
            href="/login?publicOAuth=1"
            className="mt-3 block rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-center text-sm font-medium text-[var(--text)] transition hover:bg-[var(--bg-elevated)]"
          >
            Continue as a candidate
          </Link>
        ) : null}
      </div>
    </div>
  );
}
