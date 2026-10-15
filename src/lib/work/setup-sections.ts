/**
 * Setup: every setting that isn't part of a single job, in one place.
 *
 * Each entry points at the screen that already does the job today. The list is
 * filtered by the same route rules the app enforces, so people only see what
 * their role is allowed to change.
 */
import type { UserRole } from "@/types/database";
import {
  resolveDashboardRouteAccessRule,
  shouldRedirectNonOrgAdminFromOrgConfigPath,
} from "@/lib/security/dashboard-route-policy";

export interface SetupLink {
  name: string;
  note: string;
  href: string;
}

export interface SetupSection {
  id: string;
  title: string;
  why: string;
  links: SetupLink[];
}

export const SETUP_SECTIONS: SetupSection[] = [
  {
    id: "calendars",
    title: "Calendars and availability",
    why: "So interviews can be booked without back-and-forth.",
    links: [
      { name: "My availability", note: "When you can interview", href: "/recruit/my-availability" },
      { name: "Team calendar", note: "Everyone's interviews in one view", href: "/calendar" },
      {
        name: "Calendar and email connections",
        note: "Google or Microsoft",
        href: "/recruit/settings/integrations",
      },
    ],
  },
  {
    id: "process",
    title: "Hiring process",
    why: "The stages every job moves through, and who approves what.",
    links: [
      {
        name: "Interview stages",
        note: "The default pipeline for new jobs",
        href: "/recruit/settings/pipeline",
      },
      {
        name: "Request approvals",
        note: "Who signs off a new role",
        href: "/recruit/settings/requisition-approval-workflow",
      },
      {
        name: "Offer approvals",
        note: "Who signs off an offer",
        href: "/recruit/settings/offer-approval-workflow",
      },
      {
        name: "Approval cover",
        note: "Who approves when someone is away",
        href: "/recruit/settings/requisition-delegations",
      },
    ],
  },
  {
    id: "scoring",
    title: "Scoring and screening",
    why: "How the agent judges candidates before you see them.",
    links: [
      {
        name: "Rubric library",
        note: "Rubrics you can reuse across jobs",
        href: "/recruit/v2/setup/rubric",
      },
      {
        name: "Screening questions",
        note: "Default questions on the apply form",
        href: "/recruit/settings/screening",
      },
      {
        name: "Benchmarks",
        note: "What good looks like in your market",
        href: "/recruit/v2/setup/benchmarks",
      },
    ],
  },
  {
    id: "templates",
    title: "Templates",
    why: "Words and numbers you reuse, written once.",
    links: [
      {
        name: "Request templates",
        note: "Starting points for new roles",
        href: "/recruit/settings/requisition-templates",
      },
      {
        name: "Message templates",
        note: "Emails and WhatsApp messages",
        href: "/recruit/settings/templates",
      },
      {
        name: "Offer letters",
        note: "Letter templates",
        href: "/recruit/settings/offer-letter-templates",
      },
      {
        name: "Pay bands",
        note: "Ranges offers are checked against",
        href: "/recruit/settings/compensation-bands",
      },
    ],
  },
  {
    id: "channels",
    title: "Channels and integrations",
    why: "Where jobs are posted and which tools TigerHire talks to.",
    links: [
      {
        name: "Job boards",
        note: "LinkedIn, Naukri and others",
        href: "/company/settings/job-boards",
      },
      {
        name: "Integrations",
        note: "Your ATS, HRIS and other tools",
        href: "/recruit/v2/setup/integrations",
      },
    ],
  },
  {
    id: "team",
    title: "Team and sharing",
    why: "Who can see and do what.",
    links: [
      { name: "Team", note: "Invite people and set their roles", href: "/company/team" },
      { name: "Permissions", note: "What each role can do", href: "/company/settings/permissions" },
    ],
  },
];

/** Only the links this person may open, and only sections with something left. */
export function setupFor(role: UserRole, isOrgAdmin: boolean): SetupSection[] {
  return SETUP_SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => {
      const rule = resolveDashboardRouteAccessRule(l.href);
      if (rule && !rule.roles.includes(role)) return false;
      return !shouldRedirectNonOrgAdminFromOrgConfigPath(l.href, isOrgAdmin, role);
    }),
  })).filter((s) => s.links.length > 0);
}
