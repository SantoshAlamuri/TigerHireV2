import { HIRING_WORKFLOW_GROUP_LABEL } from "@/lib/navigation/sidebar-workflow";
import type { UserRole } from "@/types/database";

export type NavGroupTemplate = {
  label: string;
  entryIds: string[];
  subtle?: boolean;
  autoHide?: boolean;
};

/** Sidebar group structure for customer-shell roles (entry ids reference NAV_REGISTRY). */
export const NAV_GROUP_STRUCTURE_BY_ROLE: Partial<Record<UserRole, NavGroupTemplate[]>> = {
  leadership: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      entryIds: [
        "home",
        "calendar",
        "tasks",
        "jobs.portfolio",
        "jobs.pipeline",
        "interviews.calendar",
        "interviews.my_availability",
        "jobs.offers",
        "jobs.offers_draft",
        "jobs.approvals",
        "jobs.governance",
        "jobs.requisitions",
        "jobs.hiring_setup",
      ],
    },
    {
      label: "Sourcing",
      entryIds: ["jobs", "candidates", "jobs.applications", "jobs.assessments"],
    },
    {
      label: "Insights",
      entryIds: ["analytics"],
    },
    {
      label: "Referrals",
      entryIds: ["referrals", "referrals.campaigns"],
    },
  ],
  recruiter: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      entryIds: [
        "home",
        "calendar",
        "tasks",
        "jobs.portfolio",
        "jobs.pipeline",
        "interviews.calendar",
        "interviews.my_availability",
        "jobs.offers",
        "jobs.offers_draft",
        "jobs.approvals",
        "jobs.governance",
        "jobs.requisitions",
        "jobs.hiring_setup",
      ],
    },
    {
      label: "Sourcing",
      entryIds: ["jobs", "candidates", "jobs.applications", "jobs.assessments"],
    },
    {
      label: "Insights",
      entryIds: ["analytics", "analytics.saved_searches"],
    },
    {
      label: "Referrals",
      entryIds: ["referrals", "referrals.campaigns"],
    },
  ],
  hiring_manager: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      entryIds: [
        "home",
        "calendar",
        "tasks",
        "jobs",
        "jobs.pipeline",
        "jobs.requisitions",
        "jobs.approvals",
        "jobs.offers",
        "jobs.offers_draft",
        "interviews.prep",
        "interviews.calendar",
        "interviews.my_availability",
        "jobs.assessments",
      ],
    },
    {
      label: "Insights",
      entryIds: ["analytics"],
    },
    {
      label: "Account",
      subtle: true,
      autoHide: true,
      entryIds: ["account.my_settings"],
    },
  ],
  interviewer: [
    {
      label: "Interviews",
      entryIds: ["home", "interviews.calendar", "interviews.my_availability", "interviews.prep"],
    },
  ],
  finance: [
    {
      label: "Finance",
      entryIds: ["home", "finance", "finance.referral_statement"],
    },
  ],
  employee: [
    // One group, two destinations. This was "Home" + four "Refer & Earn" entries,
    // three of which redirected to the same hub.
    {
      label: "Refer & Earn",
      entryIds: ["workspace", "referrals.join"],
    },
    {
      label: "Account",
      subtle: true,
      autoHide: true,
      entryIds: ["workspace.resign"],
    },
  ],
};
