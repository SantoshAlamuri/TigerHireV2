import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import ScrollReveal from "@/components/marketing/ScrollReveal";
import { PublicNav, PublicFooter, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

export const metadata: Metadata = {
  title: "Blog",
  description: `${SITE_MARKETING.brand} on global hiring — talent intelligence, explainable scoring, interview design, and recruitment operations.`,
  keywords: [
    "hiring blog",
    "talent intelligence insights",
    "explainable ai hiring",
    "interview scorecards",
    "recruitment operations",
  ],
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: `${SITE_MARKETING.brand} Blog — Hiring, intelligence, and talent`,
    description: SITE_MARKETING.ogDescription,
    url: "https://tigerhire.io/blog",
    siteName: SITE_MARKETING.brand,
    type: "website",
    images: [
      {
        url: "https://tigerhire.io/icons/icon-512.png",
        width: 512,
        height: 512,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_MARKETING.brand} Blog`,
    description: SITE_MARKETING.descriptionShort,
    images: ["https://tigerhire.io/icons/icon-512.png"],
  },
};

const POSTS = [
  {
    slug: "why-ai-scoring-is-the-next-evolution-of-talent-acquisition",
    title: "Why AI scoring is the next evolution of talent acquisition",
    excerpt:
      "Data-led hiring is no longer optional. How Talent Intelligence and explainable AI change the game for HR teams and candidates alike.",
    category: "AI & Hiring",
    readTime: "6 min",
    date: "Apr 29, 2026",
    featured: true,
  },
  {
    slug: "how-we-reduced-time-to-fill-by-12-days",
    title: "How we reduced time-to-fill by 12 days — and the 3 things we changed",
    excerpt:
      "Real numbers from an HR leader who lived the problem. What actually moves the needle on hiring speed and quality.",
    category: "Case Study",
    readTime: "8 min",
    date: "Apr 24, 2026",
    featured: false,
  },
  {
    slug: "what-your-cv-scores-against-a-typical-startup-jd",
    title: "What does your CV score against a typical startup JD?",
    excerpt:
      "We ran 500 profiles through FitScore. Here's what we found about skills match, experience signals, and where candidates get stuck.",
    category: "Data",
    readTime: "5 min",
    date: "Apr 20, 2026",
    featured: false,
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  "AI & Hiring": "text-blue-400 bg-blue-500/10 border-blue-500/15",
  "Case Study": "text-emerald-400 bg-emerald-500/10 border-emerald-500/15",
  Data: "text-purple-400 bg-purple-500/10 border-purple-500/15",
};

export default function BlogPage() {
  const featured = POSTS.find((p) => p.featured);
  const others = POSTS.filter((p) => !p.featured);

  return (
    <PublicPageWrapper>
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
              <Sparkles size={14} />
              Blog
            </span>
            <h1 className="heading-hero mt-6 text-[2.5rem] text-[var(--text)] sm:text-5xl md:text-6xl animate-fade-up animate-fade-up-2">
              Insights on hiring,
              <br />
              <span className="bg-gradient-to-r from-[var(--accent)] via-amber-400 to-orange-400 bg-clip-text text-transparent">
                AI, and talent.
              </span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[var(--text-muted)] animate-fade-up animate-fade-up-3">
              Practical thinking on hiring at scale — talent intelligence, explainable scoring, and
              workflows that work across markets.
            </p>
          </div>
        </section>

        {/* ═══ Featured Post ═══ */}
        {featured && (
          <section className="mx-auto max-w-5xl px-5 py-14 md:py-20 lg:px-8">
            <ScrollReveal variant="scale">
              <article className="group gradient-border card-hover overflow-hidden rounded-2xl border border-[var(--accent)]/20 bg-[var(--accent-muted)]/10 backdrop-blur-sm">
                <div className="p-8 md:p-12">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        CATEGORY_COLORS[featured.category] ??
                        "text-[var(--text-muted)] bg-[var(--surface)] border-[var(--border)]"
                      }`}
                    >
                      {featured.category}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
                      <Clock size={12} />
                      {featured.readTime}
                    </span>
                    <span className="rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-1 text-xs font-medium text-[var(--text-muted)]">
                      {featured.date}
                    </span>
                  </div>

                  <h2 className="heading-card mt-5 text-2xl text-[var(--text)] md:text-3xl">
                    <Link
                      href={`/blog/${featured.slug}`}
                      className="transition hover:text-[var(--accent)]"
                    >
                      {featured.title}
                    </Link>
                  </h2>

                  <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--text-muted)]">
                    {featured.excerpt}
                  </p>

                  <Link
                    href={`/blog/${featured.slug}`}
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)] transition hover:text-[var(--accent-hover)]"
                  >
                    Read article <ArrowRight size={14} />
                  </Link>
                </div>
              </article>
            </ScrollReveal>
          </section>
        )}

        {/* ═══ Post Grid ═══ */}
        <section className="mx-auto max-w-5xl px-5 py-14 md:py-20 lg:px-8">
          <div className="grid gap-4 sm:grid-cols-2">
            {others.map((post, i) => (
              <ScrollReveal key={post.slug} delay={i * 100} className="h-full">
                <article className="group card-hover flex h-full flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-6 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                        CATEGORY_COLORS[post.category] ??
                        "text-[var(--text-muted)] bg-[var(--surface)] border-[var(--border)]"
                      }`}
                    >
                      {post.category}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-[var(--text-subtle)]">
                      <Clock size={12} />
                      {post.readTime}
                    </span>
                  </div>

                  <h3 className="heading-card mt-4 flex-1 text-lg text-[var(--text)]">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="transition hover:text-[var(--accent)]"
                    >
                      {post.title}
                    </Link>
                  </h3>

                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                    {post.excerpt}
                  </p>

                  <div className="mt-5 flex items-center justify-between">
                    <span className="text-xs text-[var(--text-subtle)]">{post.date}</span>
                  </div>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* ═══ Newsletter CTA ═══ */}
        <ScrollReveal>
          <section className="mx-auto max-w-3xl px-5 py-20 md:py-28 lg:px-8">
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 p-8 text-center backdrop-blur-sm md:p-12">
              <h2 className="heading-section text-xl text-[var(--text)] md:text-2xl">
                Don&apos;t miss a post.
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--text-muted)]">
                Want specific hiring playbooks for your team? Reach out and we&apos;ll share
                relevant resources and product walkthroughs.
              </p>
              <div className="mt-6">
                <Link
                  href="/contact"
                  className="hover-lift group inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-7 py-3.5 text-sm font-semibold text-black transition hover:bg-[var(--accent-hover)] hover:shadow-[0_0_24px_var(--glow)]"
                >
                  Talk to our team
                  <ArrowRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5"
                  />
                </Link>
              </div>
            </div>
          </section>
        </ScrollReveal>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
