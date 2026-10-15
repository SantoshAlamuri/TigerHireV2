"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, type ReactNode } from "react";
import { Menu, X, ArrowRight, Mail, MessageCircle } from "lucide-react";
import TigerHireLogo from "@/components/TigerHireLogo";
import WhatsAppWidget from "@/components/WhatsAppWidget";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";

function NavLogo() {
  return <TigerHireLogo href="/" variant="dark" size="md" className="relative z-50 h-9 w-auto" />;
}

const NAV_LINKS = [
  { href: "/demo", label: "Live demo" },
  { href: "/product", label: "Product" },
  { href: "/companies", label: "Solutions" },
  { href: "/pricing", label: "Pricing" },
  { href: "/jobs", label: "Jobs" },
  { href: "/refer", label: "Refer" },
] as const;
const PRIMARY_CTA = { href: "/contact", label: "Book demo" } as const;

type PageContext = {
  kicker: string;
  title: string;
  links?: Array<{ href: string; label: string }>;
};

function getPageContext(pathname: string | null): PageContext | null {
  if (!pathname) return null;
  if (pathname.startsWith("/product")) {
    return { kicker: "Platform", title: "Talent Intelligence + ATS workflow" };
  }
  if (pathname.startsWith("/companies")) {
    return {
      kicker: "Solutions",
      title: "For companies",
      links: [
        { href: "/companies", label: "Companies" },
        { href: "/agencies", label: "Agencies" },
      ],
    };
  }
  if (pathname.startsWith("/agencies")) {
    return {
      kicker: "Solutions",
      title: "For agencies",
      links: [
        { href: "/companies", label: "Companies" },
        { href: "/agencies", label: "Agencies" },
        { href: "/candidates", label: "Candidates" },
      ],
    };
  }
  if (pathname.startsWith("/candidates")) {
    return {
      kicker: "Solutions",
      title: "For candidates",
      links: [
        { href: "/companies", label: "Companies" },
        { href: "/agencies", label: "Agencies" },
        { href: "/candidates", label: "Candidates" },
      ],
    };
  }
  if (pathname.startsWith("/jobs")) {
    return { kicker: "Marketplace", title: "Open jobs" };
  }
  if (pathname.startsWith("/refer")) {
    return { kicker: "Network", title: "Referral program" };
  }
  return null;
}

function isNavActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/companies") {
    return pathname.startsWith("/companies") || pathname.startsWith("/agencies");
  }
  if (href === "/product") return pathname.startsWith("/product");
  if (href === "/jobs") return pathname.startsWith("/jobs");
  if (href === "/refer") return pathname.startsWith("/refer");
  if (href === "/pricing") return pathname.startsWith("/pricing");
  return pathname === href;
}

export function PublicNav() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pageContext = getPageContext(pathname);
  const isCandidateContext = Boolean(pathname?.startsWith("/candidates"));
  const loginHref = isCandidateContext ? "/login?publicOAuth=1" : "/login";
  const registerHref = isCandidateContext ? "/register?publicOAuth=1" : "/register";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-[100] pt-[env(safe-area-inset-top)] transition-all duration-300 ${
        scrolled
          ? "border-b border-white/10 bg-[var(--bg)]/85 backdrop-blur-xl shadow-[0_1px_12px_rgba(0,0,0,0.3)]"
          : "bg-transparent"
      }`}
    >
      <nav className="relative z-[110] mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-5 lg:px-8">
        <div className="min-w-0 shrink-0">
          <NavLogo />
        </div>

        {/* Desktop links */}
        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {NAV_LINKS.map(({ href, label }) => {
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`relative whitespace-nowrap rounded-lg px-3.5 py-2 text-[0.85rem] transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  active ? "font-semibold text-white" : "font-medium text-white/65 hover:text-white"
                }`}
              >
                {label}
                {active && (
                  <span className="absolute inset-x-3 -bottom-0.5 h-0.5 rounded-full bg-[var(--accent)]" />
                )}
              </Link>
            );
          })}
        </div>

        {/* Desktop actions */}
        <div className="hidden shrink-0 items-center gap-1.5 md:flex">
          <Link
            href={loginHref}
            className="whitespace-nowrap rounded-lg px-3 py-2 text-[0.85rem] font-medium text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            Log in
          </Link>
          <Link
            href={registerHref}
            className="whitespace-nowrap rounded-lg px-3 py-2 text-[0.85rem] font-medium text-white/65 transition-colors hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            Sign up
          </Link>
          <Link
            href={PRIMARY_CTA.href}
            suppressHydrationWarning
            className="hover-lift cta-bloom group flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-[0.85rem] font-semibold text-black transition hover:bg-[var(--accent-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            <span suppressHydrationWarning>{PRIMARY_CTA.label}</span>
            <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>

        {/* Mobile: Log in / Sign up always visible + menu (full nav + Book demo stay in drawer) */}
        <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5 md:hidden">
          <Link
            href={loginHref}
            className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:px-2.5 sm:text-sm"
          >
            Log in
          </Link>
          <Link
            href={registerHref}
            className="whitespace-nowrap rounded-lg px-2 py-2 text-xs font-medium text-white/90 transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 sm:px-2.5 sm:text-sm"
          >
            Sign up
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(!mobileOpen)}
            className={`relative shrink-0 rounded-lg p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 ${
              scrolled
                ? "text-white"
                : "border border-white/25 bg-black/35 text-white shadow-sm backdrop-blur-md"
            }`}
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
          >
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </nav>

      {/* Desktop page context */}
      {pageContext && (
        <div className="hidden border-t border-white/10 md:block">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-5 lg:px-8">
            <p className="text-xs text-white/45">
              <span className="font-semibold uppercase tracking-wider text-white/65">
                {pageContext.kicker}
              </span>
              <span className="mx-2 text-white/45">/</span>
              <span className="font-medium text-white/65">{pageContext.title}</span>
            </p>
            {pageContext.links && (
              <div className="flex items-center gap-2">
                {pageContext.links.map((link) => {
                  const active = isNavActive(pathname, link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`rounded-md border border-white/10 px-2.5 py-1 text-xs transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                        active
                          ? "font-semibold text-white"
                          : "font-medium text-white/65 hover:text-white"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-[var(--bg)]/98 backdrop-blur-xl md:hidden">
          <div className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-2 px-6 pb-8 pt-[max(7rem,env(safe-area-inset-top)+4.5rem)]">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                onClick={() => setMobileOpen(false)}
                className={`heading-section w-full rounded-xl border px-4 py-3.5 text-left text-xl transition hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 ${
                  pathname === href
                    ? "border-white/10 font-semibold text-white"
                    : "border-white/10 text-white/65 hover:text-white"
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="mt-6 flex w-full flex-col gap-3">
              <Link
                href={loginHref}
                onClick={() => setMobileOpen(false)}
                className="w-full rounded-xl border border-white/10 py-3.5 text-center text-base font-medium text-white/65 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Log in
              </Link>
              <Link
                href={registerHref}
                onClick={() => setMobileOpen(false)}
                className="w-full rounded-xl border border-white/10 py-3.5 text-center text-base font-medium text-white/65 hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                Sign up
              </Link>
              <Link
                href={PRIMARY_CTA.href}
                suppressHydrationWarning
                onClick={() => setMobileOpen(false)}
                className="cta-bloom w-full rounded-xl bg-[var(--accent)] py-3.5 text-center text-base font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              >
                <span suppressHydrationWarning>{PRIMARY_CTA.label}</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  const pathname = usePathname();
  const isCandidateContext = Boolean(pathname?.startsWith("/candidates"));
  const loginHref = isCandidateContext ? "/login?publicOAuth=1" : "/login";

  return (
    <footer className="relative z-10 border-t border-white/10 bg-[var(--bg-elevated)]">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-5 lg:px-8 lg:py-20">
        <div className="grid gap-12 md:grid-cols-12">
          {/* Brand */}
          <div className="md:col-span-4">
            <TigerHireLogo href="/" variant="dark" size="sm" tagline />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/65 text-pretty">
              Global hiring intelligence platform. Three layers of scoring, a verdict engine, and
              full explainability — so your team knows who to hire, not just who applied.
            </p>
            <div className="mt-6 flex items-center gap-4">
              <a
                href={getPublicWhatsAppChatUrl(publicWhatsAppPrefill.footer)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/65 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label="WhatsApp"
              >
                <MessageCircle size={16} />
              </a>
              <a
                href="mailto:hello@tigerhire.io"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/65 transition hover:bg-white/[0.04] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                aria-label="Email"
              >
                <Mail size={16} />
              </a>
            </div>
          </div>

          {/* Product */}
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Product</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/pricing"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <Link
                  href="/jobs"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Open jobs
                </Link>
              </li>
              <li>
                <Link
                  href="/refer"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Refer &amp; earn
                </Link>
              </li>
              <li>
                <Link
                  href="/product"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  How it works
                </Link>
              </li>
              <li>
                <Link
                  href="/product#talent-intelligence"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Talent Intelligence
                </Link>
              </li>
              <li>
                <Link
                  href="/companies"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  For Companies
                </Link>
              </li>
              <li>
                <Link
                  href="/agencies"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  For Agencies
                </Link>
              </li>
              <li>
                <Link
                  href="/candidates"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  For Candidates
                </Link>
              </li>
              <li>
                <a
                  href="mailto:hello@tigerhire.io"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Get in touch
                </a>
              </li>
            </ul>
          </div>

          {/* Company */}
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Company</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/about"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  About
                </Link>
              </li>
              <li>
                <Link
                  href="/blog"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Blog
                </Link>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Contact
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">Legal</p>
            <ul className="mt-4 space-y-3">
              <li>
                <Link
                  href="/privacy"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link
                  href="/dpa"
                  className="rounded-md px-1 text-sm text-white/65 transition hover:bg-white/[0.04] hover:text-white"
                >
                  DPA
                </Link>
              </li>
            </ul>
          </div>

          {/* CTA */}
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Get started
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)]"
              >
                Open app
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-lg border border-white/10 px-4 py-2.5 text-sm font-medium text-white/65 transition hover:bg-white/[0.04] hover:text-white"
              >
                Book a demo
              </Link>
            </div>
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 sm:flex-row">
          <p className="text-xs text-white/45">
            &copy; 2026 TigerHire, a unit of OutsideIn Private Limited.
          </p>
          <span className="badge-accent text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--accent)] opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent)]" />
            </span>
            Live now — hello@tigerhire.io
          </span>
        </div>
      </div>
    </footer>
  );
}

export function PublicPageWrapper({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Animated gradient mesh */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="mesh-orb mesh-orb-1 -left-40 top-20 h-[420px] w-[420px] bg-amber-500/[0.07]" />
        <div className="mesh-orb mesh-orb-2 -right-20 top-1/3 h-[350px] w-[350px] bg-orange-600/[0.05]" />
        <div className="mesh-orb mesh-orb-3 bottom-40 left-1/3 h-[300px] w-[300px] bg-amber-400/[0.04]" />
      </div>
      <div className="relative z-10">{children}</div>
      <WhatsAppWidget />
    </div>
  );
}
