"use client";

import Link from "next/link";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { SeatGate } from "../SeatGate";

/**
 * Hiring Setup — one list, one line each, straight to the thing.
 *
 * This page is visited rarely and always with a specific errand in mind
 * ("change the offer letter", "fix the screening questions"). So it is a
 * directory, not a dashboard: no cards to read, no counts to interpret, no
 * job list duplicating the Jobs tab. Scan the left column, click, done.
 *
 * Per-job setup deliberately lives on the job, not here — a rubric belongs to
 * a role, and hunting for it through a settings page is the flow this whole
 * redesign is trying to kill.
 */
const GROUPS: {
  heading: string;
  items: { label: string; hint: string; href: string }[];
}[] = [
  {
    heading: "Rubric library",
    items: [
      {
        // Pointed at /recruit/settings/scoring, which was never built — the
        // entry read as a feature and behaved as a 404.
        label: "Scoring rubrics",
        hint: "One rubric per role — versioned, with a named approver",
        href: "/recruit/v2/setup/rubric",
      },
      {
        label: "Compensation bands",
        hint: "What expected CTC is checked against",
        href: "/recruit/settings/compensation-bands",
      },
    ],
  },
  {
    heading: "Screening question sets",
    items: [
      {
        label: "Screening questions",
        hint: "Asked on WhatsApp at apply time or after shortlisting",
        href: "/recruit/settings/screening",
      },
    ],
  },
  {
    heading: "Benchmarks & targets",
    items: [
      {
        label: "Benchmarks",
        hint: "What analytics judges your numbers against — published figures, or your own targets",
        href: "/recruit/v2/setup/benchmarks",
      },
    ],
  },
  {
    heading: "Interview kits",
    items: [
      {
        label: "Pipeline stages",
        hint: "The rounds every job starts with",
        href: "/recruit/settings/pipeline",
      },
      {
        label: "Scorecards & templates",
        hint: "How interviewers record feedback",
        href: "/recruit/settings/templates",
      },
    ],
  },
  {
    heading: "Offers & requisitions",
    items: [
      {
        label: "Offer letter templates",
        hint: "What candidates receive and sign",
        href: "/recruit/settings/offer-letter-templates",
      },
      {
        label: "Offer approvals",
        hint: "Who signs off before an offer goes out",
        href: "/recruit/settings/offer-approval-workflow",
      },
      {
        // Points at the chain builder now: the old page only let you pick
        // between two presets, both of which always require Finance.
        label: "Requisition approvals",
        hint: "Who signs off before a job opens — your own chain, with skip rules",
        href: "/recruit/v2/setup/approvals",
      },
    ],
  },
  {
    heading: "Connections",
    items: [
      {
        label: "Integrations",
        hint: "Channels and services · TigerHire-run ones are on/off only",
        href: "/recruit/v2/setup/integrations",
      },
    ],
  },
  {
    heading: "Org admin",
    items: [
      {
        label: "Team & permissions",
        hint: "Who can do what",
        href: "/company/settings/permissions",
      },
      { label: "Billing", hint: "Plan and invoices", href: "/company/billing" },
      {
        label: "Privacy & retention",
        hint: "How long data is kept",
        href: "/company/settings/privacy",
      },
      { label: "Audit log", hint: "Every admin action", href: "/company/settings/audit" },
    ],
  },
];

/**
 * Layout note: this page is a directory, so it fills the width.
 *
 * It was capped at `max-w-3xl` — 768px of content in a 1500px shell, so on any
 * normal display everything hugged the left edge with half the page empty
 * beside it, and the seven groups ran off the bottom instead. A narrow measure
 * is right for the forms in this tree (rubric editing, a submission, a
 * scorecard) where a full-width input row is harder to read, and wrong for a
 * list of links whose whole job is to be scanned in one look.
 *
 * The groups are columns rather than one stack, so the page ends where the
 * content does.
 */
function RecruitV2SetupPageBody() {
  return (
    <section>
      <PageHeader
        title="Hiring Setup"
        subtitle="Defaults every job inherits. A job's own rubric and questions live on the job itself."
      />

      <div className="grid items-start gap-x-5 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {GROUPS.map((group) => (
          <div key={group.heading}>
            <h2 className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/35">
              {group.heading}
            </h2>
            <ul className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40">
              {group.items.map((item) => (
                <li key={item.href} className="border-b border-white/5 last:border-b-0">
                  <Link
                    href={item.href}
                    className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-white/[0.03]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-[var(--text)]">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-white/45">{item.hint}</span>
                    </span>
                    <span className="shrink-0 text-xs text-white/30">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function RecruitV2SetupPage() {
  return (
    <SeatGate need="editJobSetup" what="Hiring Setup">
      <RecruitV2SetupPageBody />
    </SeatGate>
  );
}
