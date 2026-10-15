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
  /** Org-wide setting: only org admins see it. */
  adminOnly?: boolean;
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
    title: "You",
    why: "Your details, your calendar and when you can interview.",
    links: [
      {
        name: "Your profile",
        note: "Name, sign-in and the emails you get",
        href: "/work/setup/profile",
      },
      { name: "Your calendar", note: "Google or Microsoft", href: "/work/setup/calendar" },
      { name: "My availability", note: "When you can interview", href: "/work/setup/availability" },
    ],
  },
  {
    id: "team",
    title: "Company and team",
    why: "Who you are, who's on the team and what each person can do.",
    links: [
      {
        name: "Company",
        note: "Name and work email domain",
        href: "/work/setup/company",
        adminOnly: true,
      },
      {
        name: "Team",
        note: "Invite people and choose what they do",
        href: "/work/setup/team",
        adminOnly: true,
      },
      {
        name: "Permissions",
        note: "What recruiters and hiring managers may do",
        href: "/work/setup/permissions",
        adminOnly: true,
      },
      {
        name: "Plan",
        note: "What you're on and what you've used",
        href: "/work/setup/plan",
        adminOnly: true,
      },
    ],
  },
  {
    id: "process",
    title: "Hiring process",
    why: "The stages every job moves through, who approves, and how candidates are screened.",
    links: [
      {
        name: "Stages and approvals",
        note: "The stages new jobs start with, and who signs off roles",
        href: "/work/setup/process",
      },
      {
        name: "Approval cover",
        note: "Who approves when someone is away",
        href: "/work/setup/approval-cover",
        adminOnly: true,
      },
      {
        name: "Screening",
        note: "WhatsApp or voice, the score bar and calling hours",
        href: "/work/setup/screening",
      },
    ],
  },
  {
    id: "channels",
    title: "Boards and tools",
    why: "Where jobs are posted and which tools TigerHire talks to.",
    links: [
      {
        name: "Job boards",
        note: "idibu, Indeed and Adzuna",
        href: "/work/setup/job-boards",
        adminOnly: true,
      },
      {
        name: "Connected tools",
        note: "HR system, background checks, email and company sign-in",
        href: "/work/setup/integrations",
        adminOnly: true,
      },
    ],
  },
  {
    id: "privacy",
    title: "Privacy",
    why: "Recording consent, how long things are kept, and a log of changes.",
    links: [
      {
        name: "Privacy and records",
        note: "Consent, retention and the change log",
        href: "/work/setup/privacy",
        adminOnly: true,
      },
    ],
  },
  {
    id: "help",
    title: "Help",
    why: "A person at TigerHire reads every request.",
    links: [
      { name: "Ask for help", note: "And see what you've asked before", href: "/work/setup/help" },
    ],
  },
];

/** Only the links this person may open, and only sections with something left. */
export function setupFor(role: UserRole, isOrgAdmin: boolean): SetupSection[] {
  return SETUP_SECTIONS.map((s) => ({
    ...s,
    links: s.links.filter((l) => {
      if (l.adminOnly && !isOrgAdmin && role !== "super_admin") return false;
      const rule = resolveDashboardRouteAccessRule(l.href);
      if (rule && !rule.roles.includes(role)) return false;
      return !shouldRedirectNonOrgAdminFromOrgConfigPath(l.href, isOrgAdmin, role);
    }),
  })).filter((s) => s.links.length > 0);
}
