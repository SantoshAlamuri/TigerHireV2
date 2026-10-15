import Link from "next/link";
import TigerHireLogo from "@/components/TigerHireLogo";
import { Phone } from "lucide-react";
import {
  companyOnboardingTelHref,
  formatCompanyOnboardingPhone,
  getCompanyOnboardingPhoneRaw,
} from "@/lib/company/onboarding-phone";

export default function CompanyPendingActivationPage() {
  const phoneRaw = getCompanyOnboardingPhoneRaw();
  const phone = phoneRaw ? formatCompanyOnboardingPhone(phoneRaw) : null;
  const tel = phoneRaw ? companyOnboardingTelHref(phoneRaw) : "";

  return (
    <div className="mx-auto max-w-lg rounded-xl border border-[var(--accent)]/35 bg-[var(--surface)]/90 p-6 shadow-lg sm:p-8">
      <TigerHireLogo href="/" variant="dark" size="sm" className="h-7 w-auto" />
      <h1 className="heading-section mt-5 text-xl text-[var(--text)] sm:text-2xl">
        Your next step: activate your workspace
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-[var(--text-muted)]">
        Your account has been created. Before you can post jobs or use hiring tools, TigerHire needs
        to approve your company workspace. Contact our onboarding team with your company name and
        the work email you used to register.
      </p>
      {phone && tel ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
          <Phone size={16} className="shrink-0 text-[var(--accent)]" aria-hidden />
          <a
            href={tel}
            className="text-[var(--accent)] underline decoration-[var(--accent)]/50 underline-offset-2 transition hover:decoration-[var(--accent)]"
          >
            Call {phone}
          </a>
        </p>
      ) : null}
      <Link
        href="/contact"
        className="mt-4 inline-block text-sm text-[var(--accent)] underline underline-offset-2"
      >
        Contact the onboarding team online
      </Link>
      <p className="mt-4 text-xs text-[var(--text-muted)]">
        After approval, select “Check activation status” below to open your workspace. If you return
        to this screen, activation is still pending; you do not need to register again.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex flex-1 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] px-4 py-2.5 text-center text-sm font-medium text-[var(--text)] transition hover:bg-white/10"
        >
          Back to sign in
        </Link>
        <Link
          href="/company"
          className="inline-flex flex-1 items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
        >
          Check activation status
        </Link>
      </div>
    </div>
  );
}
