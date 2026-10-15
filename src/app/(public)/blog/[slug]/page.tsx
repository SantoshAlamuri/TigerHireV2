import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PublicFooter, PublicNav, PublicPageWrapper } from "@/components/marketing/PublicLayout";
import { SITE_MARKETING } from "@/lib/marketing/site-meta";

type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  readTime: string;
  date: string;
  body: string[];
};

const BLOG_POSTS: BlogPost[] = [
  {
    slug: "why-ai-scoring-is-the-next-evolution-of-talent-acquisition",
    title: "Why AI scoring is the next evolution of talent acquisition",
    excerpt:
      "Data-led hiring is no longer optional. How Talent Intelligence and explainable AI change the game for HR teams and candidates alike.",
    category: "AI & Hiring",
    readTime: "6 min",
    date: "Apr 29, 2026",
    body: [
      "Most hiring teams are not struggling with application volume. They are struggling with decision quality and consistency. Traditional keyword filters and CV ranking tools provide a list, but they do not provide a defensible verdict.",
      "Explainable scoring changes that. When every score shows why a candidate is strong or weak against role-specific criteria, recruiters and hiring managers can align faster and make fewer subjective reversals later in the pipeline.",
      "The next phase of talent acquisition is not just automation. It is accountable intelligence: a shared standard up front, clear evidence at screening, and a decision trail that stands up to leadership and compliance reviews.",
    ],
  },
  {
    slug: "how-we-reduced-time-to-fill-by-12-days",
    title: "How we reduced time-to-fill by 12 days — and the 3 things we changed",
    excerpt:
      "Real numbers from an HR leader who lived the problem. What actually moves the needle on hiring speed and quality.",
    category: "Case Study",
    readTime: "8 min",
    date: "Apr 24, 2026",
    body: [
      "Reducing time-to-fill was not about adding more sourcing channels. It started with agreeing on a decision framework before screening began. Once the hiring manager approved the evaluation bar early, downstream back-and-forth dropped sharply.",
      "The second shift was introducing explainable scorecards in shortlisting discussions. Recruiters stopped defending intuition and started sharing evidence tied to role requirements, which shortened review loops and interview scheduling delays.",
      "Third, candidate communication moved to channels where candidates already respond quickly. Faster acknowledgements and scheduling reminders helped the team preserve momentum and convert qualified candidates earlier in the funnel.",
    ],
  },
  {
    slug: "what-your-cv-scores-against-a-typical-startup-jd",
    title: "What does your CV score against a typical startup JD?",
    excerpt:
      "We ran 500 profiles through FitScore. Here's what we found about skills match, experience signals, and where candidates get stuck.",
    category: "Data",
    readTime: "5 min",
    date: "Apr 20, 2026",
    body: [
      "In a sample of 500 profiles benchmarked against startup engineering and business roles, the median candidate underperformed most often on role-context evidence, not on raw skill keywords.",
      "Candidates with clear impact statements, scope of ownership, and recent toolchain alignment consistently scored higher than those with broad but generic CV summaries.",
      "For candidates, the practical takeaway is simple: tailor evidence to the role's required outcomes. For hiring teams, structured scoring helps separate signal from formatting noise and improves shortlist quality.",
    ],
  },
];

function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

type BlogPostPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) return {};

  return {
    title: post.title,
    description: post.excerpt,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | ${SITE_MARKETING.brand}`,
      description: post.excerpt,
      url: `https://tigerhire.io/blog/${post.slug}`,
      siteName: SITE_MARKETING.brand,
      type: "article",
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
      title: `${post.title} | ${SITE_MARKETING.brand}`,
      description: post.excerpt,
      images: ["https://tigerhire.io/icons/icon-512.png"],
    },
  };
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
  const { slug } = await params;
  const post = getPost(slug);
  if (!post) {
    notFound();
  }

  return (
    <PublicPageWrapper>
      <PublicNav />
      <main className="relative z-10 px-5 pt-28 pb-16 lg:px-8 lg:pt-36">
        <article className="mx-auto max-w-3xl">
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--text-muted)] transition hover:text-[var(--accent)]"
          >
            <ArrowLeft size={14} />
            Back to blog
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
            {post.category}
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text)] md:text-5xl">
            {post.title}
          </h1>
          <p className="mt-4 text-sm text-[var(--text-muted)]">
            {post.date} · {post.readTime} read
          </p>
          <p className="mt-8 text-lg leading-relaxed text-[var(--text-muted)]">{post.excerpt}</p>
          <div className="mt-10 space-y-6">
            {post.body.map((paragraph) => (
              <p key={paragraph} className="text-base leading-8 text-[var(--text-muted)]">
                {paragraph}
              </p>
            ))}
          </div>
        </article>
      </main>
      <PublicFooter />
    </PublicPageWrapper>
  );
}
