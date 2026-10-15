"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isPlanDocumentUiEnabled } from "@/lib/rollouts/plan-document-ui";

const navClass = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition";
const activeClass = "bg-[var(--accent)] text-black";
const idleClass = "text-white/60 hover:bg-white/[0.04] hover:text-[var(--text)]";

export function RecruitJobSubNav({ jobId }: { jobId: string }) {
  const pathname = usePathname();
  const base = `/recruit/jobs/${jobId}`;
  const planFirst = isPlanDocumentUiEnabled();

  const items: { href: string; label: string; match: "exact" | "prefix"; title?: string }[] =
    planFirst
      ? [
          { href: base, label: "Plan", match: "exact", title: "Recruitment plan document" },
          {
            href: `${base}/applications`,
            label: "Applications",
            match: "prefix",
            title: "Inbound applicants for this job — status, FitScore, shortlist/reject",
          },
          {
            href: `${base}/interviews`,
            label: "Scheduling",
            match: "prefix",
            title: "Create slots, book interviews, self-schedule links",
          },
          {
            href: `${base}/assessments`,
            label: "Assessments",
            match: "prefix",
            title: "Send take-homes, review submissions, score candidates",
          },
          {
            href: `${base}/screening`,
            label: "Screening",
            match: "exact",
            title: "Review prescreen answers, FitScore, and bulk reject",
          },
        ]
      : [
          { href: base, label: "Overview", match: "exact" },
          { href: `${base}/matches`, label: "Matches", match: "exact" },
          {
            href: `${base}/screening`,
            label: "Screening",
            match: "exact",
            title: "Review prescreen answers, FitScore, and bulk reject",
          },
          {
            href: `${base}/interviews`,
            label: "Interviews",
            match: "prefix",
            title: "Open time slots, book candidates, self-schedule links",
          },
          {
            href: `${base}/pipeline-stages`,
            label: "Hiring setup",
            match: "prefix",
            title: "Pipeline rounds, interviewer assignment, feedback templates",
          },
          { href: `${base}/approvals`, label: "Approvals", match: "prefix" },
          { href: `${base}/feedback`, label: "Feedback", match: "prefix" },
          { href: `${base}/feedback-templates`, label: "Feedback templates", match: "prefix" },
        ];

  const isActive = (href: string, match: "exact" | "prefix") => {
    if (match === "exact") return pathname === href;
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      className="mb-6 flex flex-wrap gap-1 border-b border-[var(--border)] pb-3"
      aria-label="Job sections"
    >
      {items.map(({ href, label, match, title }) => {
        const active = isActive(href, match);
        return (
          <Link
            key={href}
            href={href}
            title={title}
            className={`${navClass} ${active ? activeClass : idleClass}`}
            aria-current={active ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
