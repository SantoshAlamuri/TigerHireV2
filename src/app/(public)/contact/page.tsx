"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  MessageCircle,
  Mail,
  Calendar,
  Clock,
  MapPin,
  Send,
  CheckCircle2,
} from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { getPublicWhatsAppChatUrl, publicWhatsAppPrefill } from "@/lib/marketing/public-whatsapp";

const WHATSAPP_LINK = getPublicWhatsAppChatUrl(publicWhatsAppPrefill.contact);
const WHATSAPP_AFTER_FORM_LINK = getPublicWhatsAppChatUrl(publicWhatsAppPrefill.contactAfterForm);
const DEMO_BOOKING_URL = (process.env.NEXT_PUBLIC_DEMO_BOOKING_URL ?? "").trim();

const TYPE_OPTIONS = [
  { value: "company", label: "Company / Recruiter" },
  { value: "candidate", label: "Candidate" },
  { value: "press", label: "Press" },
  { value: "partner", label: "Partner" },
  { value: "other", label: "Other" },
] as const;

export default function ContactPage() {
  const contactSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "TigerHire",
    url: "https://tigerhire.io",
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: "hello@tigerhire.io",
        areaServed: "IN",
        availableLanguage: ["English"],
      },
    ],
  };

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<string>("company");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, company, message, type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Something went wrong");
      setStatus("success");
      setName("");
      setEmail("");
      setCompany("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMessage(
        "We couldn't send your message. Please try WhatsApp or email us at hello@tigerhire.io.",
      );
    }
  }

  return (
    <PublicPageWrapper>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(contactSchema) }}
      />
      <PublicNav />
      <main className="relative z-10">
        {/* ═══ Hero ═══ */}
        <section className="relative overflow-hidden px-5 pt-28 pb-8 md:pt-36 md:pb-14 lg:px-8">
          <div
            className="mesh-orb mesh-orb-1 left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 bg-amber-500/[0.05]"
            aria-hidden
          />
          <div className="mx-auto max-w-4xl">
            <span className="badge-accent animate-fade-up animate-fade-up-1">
              <MessageCircle size={14} />
              Contact
            </span>
            <h1 className="heading-hero mt-6 text-[2.5rem] text-[var(--text)] sm:text-5xl md:text-6xl animate-fade-up animate-fade-up-2">
              Let&apos;s{" "}
              <span className="bg-gradient-to-r from-[var(--accent)] via-amber-400 to-orange-400 bg-clip-text text-transparent">
                talk.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[var(--text-muted)] animate-fade-up animate-fade-up-3">
              Whether you&apos;re a company, a candidate, or just curious — we respond fast. Really
              fast.
            </p>
          </div>
        </section>

        {/* ═══ Split: Form + Info ═══ */}
        <section className="mx-auto max-w-6xl px-5 py-12 md:py-20 lg:px-8">
          <div className="grid gap-10 md:grid-cols-[3fr_2fr] md:gap-16">
            {/* Form */}
            <div>
              {status === "success" ? (
                <div className="flex flex-col items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-10 text-center backdrop-blur-sm">
                  <CheckCircle2 size={48} className="text-emerald-400" />
                  <h2 className="heading-card mt-5 text-xl text-[var(--text)]">
                    You&apos;re all set
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
                    We received your message and will reply by email within 24 hours (often sooner).
                  </p>
                  <p className="mt-3 max-w-md text-sm text-[var(--text-muted)]">
                    Need a faster answer? Tap below — say hi on WhatsApp and we&apos;ll pick it up
                    there (typically within 4 business hours).
                  </p>
                  <a
                    href={WHATSAPP_AFTER_FORM_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover-lift mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-emerald-500/15 py-3 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                  >
                    Continue on WhatsApp <ArrowRight size={14} />
                  </a>
                  <p className="mt-4 text-xs text-[var(--text-subtle)]">
                    You can edit the draft message before you send it.
                  </p>
                  <button
                    type="button"
                    onClick={() => setStatus("idle")}
                    className="mt-6 text-sm font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label
                      htmlFor="contact-type"
                      className="block text-sm font-semibold text-[var(--text)]"
                    >
                      I am a…
                    </label>
                    <select
                      id="contact-type"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                    >
                      {TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="block text-sm font-semibold text-[var(--text)]"
                      >
                        Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block text-sm font-semibold text-[var(--text)]"
                      >
                        Email
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@company.com"
                        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="contact-company"
                      className="block text-sm font-semibold text-[var(--text)]"
                    >
                      Company <span className="text-[var(--text-subtle)]">(optional)</span>
                    </label>
                    <input
                      id="contact-company"
                      type="text"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      placeholder="Company name"
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-sm font-semibold text-[var(--text)]"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      required
                      rows={5}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="How can we help?"
                      className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--text-subtle)] transition focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={status === "loading"}
                    className="hover-lift flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_24px_var(--glow)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {status === "loading" ? (
                      "Sending…"
                    ) : (
                      <>
                        Send message <Send size={15} />
                      </>
                    )}
                  </button>

                  {status === "error" && <p className="text-sm text-red-400">{errorMessage}</p>}
                </form>
              )}
            </div>

            {/* Info sidebar */}
            <div className="space-y-6">
              {/* WhatsApp */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                    <MessageCircle size={20} />
                  </div>
                  <div>
                    <h3 className="heading-card text-base text-[var(--text)]">WhatsApp</h3>
                    <p className="text-xs text-[var(--text-muted)]">Fastest response</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  We respond to all WhatsApp messages within 4 business hours.
                </p>
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover-lift mt-4 flex items-center justify-center gap-2 rounded-full bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                >
                  Chat on WhatsApp <ArrowRight size={14} />
                </a>
              </div>

              {/* Email */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
                    <Mail size={20} />
                  </div>
                  <div>
                    <h3 className="heading-card text-base text-[var(--text)]">Email</h3>
                    <p className="text-xs text-[var(--text-muted)]">hello@tigerhire.io</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  We respond to all emails within 24 hours.
                </p>
              </div>

              {/* Demo */}
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400">
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 className="heading-card text-base text-[var(--text)]">Book a demo</h3>
                    <p className="text-xs text-[var(--text-muted)]">30 min, live on your role</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Send us one JD and we&apos;ll walk through the rubric, verdict, and a live score —
                  on your data.
                </p>
                {DEMO_BOOKING_URL ? (
                  <a
                    href={DEMO_BOOKING_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover-lift mt-4 flex items-center justify-center gap-2 rounded-full border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
                  >
                    Schedule a call <ArrowRight size={14} />
                  </a>
                ) : (
                  <a
                    href={WHATSAPP_LINK}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover-lift mt-4 flex items-center justify-center gap-2 rounded-full border border-[var(--border)] py-2.5 text-sm font-semibold text-[var(--text)] transition hover:border-[var(--border-hover)] hover:bg-[var(--surface)]"
                  >
                    Request a slot <ArrowRight size={14} />
                  </a>
                )}
              </div>

              {/* Location & hours */}
              <div className="space-y-3 px-1">
                <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                  <MapPin size={15} className="shrink-0 text-[var(--text-subtle)]" />
                  Remote-first · global team
                </div>
                <div className="flex items-center gap-2.5 text-sm text-[var(--text-muted)]">
                  <Clock size={15} className="shrink-0 text-[var(--text-subtle)]" />
                  Mon–Fri, 9 AM – 7 PM UTC
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
