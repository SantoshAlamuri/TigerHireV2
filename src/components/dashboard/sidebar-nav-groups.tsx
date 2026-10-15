"use client";

import type { UserRole } from "@/types/database";
import { HIRING_WORKFLOW_GROUP_LABEL } from "@/lib/navigation/sidebar-workflow";
import {
  BarChart3,
  Bot,
  Briefcase,
  Building2,
  CalendarClock,
  CheckSquare,
  ClipboardList,
  CreditCard,
  DollarSign,
  FileText,
  Gauge,
  Gift,
  GitPullRequest,
  Globe,
  History,
  House,
  Inbox,
  LayoutDashboard,
  LineChart,
  LogOut,
  MessageCircle,
  Plus,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Target,
  ToggleLeft,
  UserCircle,
  UserPlus,
  Users,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  children?: Array<{ label: string; href: string; icon?: React.ReactNode }>;
  /** When consecutive items share the same value, Sidebar shows one compact sub-heading before the first of each run. */
  cluster?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  subtle?: boolean;
  autoHide?: boolean;
}

export const NAV_GROUPS_BY_ROLE: Record<UserRole, NavGroup[]> = {
  super_admin: [
    {
      label: "Command Center",
      items: [{ label: "Overview", href: "/admin", icon: <LayoutDashboard size={18} /> }],
    },
    {
      label: "Intake & Activation",
      items: [
        {
          label: "Onboarding Requests",
          href: "/admin/onboarding-requests",
          icon: <ClipboardList size={18} />,
        },
        { label: "Onboard Company", href: "/admin/onboard-company", icon: <Plus size={18} /> },
        {
          label: "Organisations",
          href: "/admin/organisations",
          icon: <Building2 size={18} />,
        },
        { label: "Companies", href: "/admin/companies", icon: <Users size={18} /> },
        { label: "Users", href: "/admin/users", icon: <Users size={18} /> },
      ],
    },
    {
      label: "Commercials",
      items: [
        { label: "Billing", href: "/admin/billing", icon: <CreditCard size={18} /> },
        { label: "Plan Limits", href: "/admin/plan-limits", icon: <Gauge size={18} /> },
        { label: "Platform Costs", href: "/admin/costs", icon: <DollarSign size={18} /> },
        { label: "Referral Tools", href: "/admin/referrals", icon: <Gift size={18} /> },
      ],
    },
    {
      label: "Support & Reliability",
      items: [
        {
          label: "Support Requests",
          href: "/admin/support-requests",
          icon: <MessageCircle size={18} />,
        },
        { label: "Agent Runs", href: "/admin/agents", icon: <Bot size={18} /> },
        {
          label: "FitScore Observability",
          href: "/admin/fitscore-observability",
          icon: <LineChart size={18} />,
        },
        { label: "Audit Log", href: "/admin/audit-log", icon: <History size={18} /> },
        { label: "WhatsApp sessions", href: "/admin/whatsapp-sessions", icon: <Inbox size={18} /> },
        { label: "WhatsApp intake", href: "/admin/whatsapp-intake", icon: <Inbox size={18} /> },
        { label: "Scraping", href: "/admin/scrape", icon: <Globe size={18} /> },
      ],
    },
    {
      label: "Governance & Access",
      subtle: true,
      autoHide: true,
      items: [
        { label: "Feature Flags", href: "/admin/feature-flags", icon: <ToggleLeft size={18} /> },
        { label: "Settings", href: "/admin/settings", icon: <Settings size={18} /> },
        { label: "Integrations", href: "/admin/settings/integrations", icon: <Globe size={18} /> },
        { label: "SCIM", href: "/admin/settings/scim", icon: <ShieldCheck size={18} /> },
      ],
    },
  ],
  leadership: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      items: [
        { label: "Overview", href: "/company", icon: <Building2 size={18} /> },
        {
          label: "Candidate pipeline",
          href: "/recruit/pipeline",
          icon: <GitPullRequest size={18} />,
        },
        {
          label: "Interviews",
          href: "/company/interviews",
          icon: <ClipboardList size={18} />,
        },
        {
          label: "Offers",
          href: "/company/offers",
          icon: <FileText size={18} />,
        },
        {
          label: "Draft offers",
          href: "/company/offers/draft",
          icon: <ScrollText size={18} />,
        },
        {
          label: "Approvals",
          href: "/company/approvals",
          icon: <CheckSquare size={18} />,
          children: [
            {
              label: "Hiring requests",
              href: "/company/hiring-requests",
              icon: <ClipboardList size={18} />,
            },
          ],
        },
      ],
    },
    {
      label: "Sourcing",
      items: [
        { label: "Jobs", href: "/company/jobs", icon: <Briefcase size={18} /> },
        { label: "Candidates", href: "/recruit/candidates", icon: <Users size={18} /> },
        { label: "Assessments", href: "/recruit/assessments", icon: <CheckSquare size={18} /> },
      ],
    },
    {
      label: "Referrals",
      items: [
        { label: "Program", href: "/company/referrals", icon: <Gift size={18} /> },
        {
          label: "Campaigns",
          href: "/company/referrals/campaigns",
          icon: <Send size={18} />,
        },
      ],
    },
  ],
  recruiter: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      items: [
        {
          label: "Candidate pipeline",
          href: "/recruit/pipeline",
          icon: <GitPullRequest size={18} />,
        },
        {
          label: "Interviews",
          href: "/company/interviews",
          icon: <ClipboardList size={18} />,
        },
        {
          label: "Offers",
          href: "/company/offers",
          icon: <FileText size={18} />,
        },
        {
          label: "Draft offers",
          href: "/company/offers/draft",
          icon: <ScrollText size={18} />,
        },
        {
          label: "Approvals",
          href: "/company/approvals",
          icon: <CheckSquare size={18} />,
          children: [
            {
              label: "Hiring requests",
              href: "/company/hiring-requests",
              icon: <ClipboardList size={18} />,
            },
          ],
        },
      ],
    },
    {
      label: "Sourcing",
      items: [
        {
          label: "Jobs",
          href: "/recruit/jobs",
          icon: <Briefcase size={18} />,
        },
        { label: "Candidates", href: "/recruit/candidates", icon: <Users size={18} /> },
        { label: "Assessments", href: "/recruit/assessments", icon: <CheckSquare size={18} /> },
      ],
    },
    {
      label: "Insights",
      items: [
        { label: "Analytics", href: "/recruit/analytics", icon: <BarChart3 size={18} /> },
        { label: "Ask your data", href: "/recruit/agent", icon: <Bot size={18} /> },
        { label: "Saved Searches", href: "/recruit/saved-searches", icon: <Search size={18} /> },
      ],
    },
    {
      label: "Referrals",
      items: [
        { label: "Program", href: "/company/referrals", icon: <Gift size={18} /> },
        {
          label: "Campaigns",
          href: "/company/referrals/campaigns",
          icon: <Send size={18} />,
        },
      ],
    },
  ],
  hiring_manager: [
    {
      label: HIRING_WORKFLOW_GROUP_LABEL,
      items: [
        { label: "Overview", href: "/company/my-jobs", icon: <LayoutDashboard size={18} /> },
        { label: "My pipeline", href: "/company/my-pipeline", icon: <GitPullRequest size={18} /> },
        {
          label: "Hiring requests",
          href: "/company/hiring-requests",
          icon: <ClipboardList size={18} />,
        },
        { label: "Approvals", href: "/company/approvals", icon: <CheckSquare size={18} /> },
        { label: "Offers", href: "/company/offers", icon: <FileText size={18} /> },
        { label: "Offer drafts", href: "/company/offers/draft", icon: <ScrollText size={18} /> },
        {
          label: "Interview prep",
          href: "/recruit/interview-prep",
          icon: <CalendarClock size={18} />,
        },
        { label: "Interviews", href: "/company/interviews", icon: <ClipboardList size={18} /> },
        { label: "Assessments", href: "/recruit/assessments", icon: <CheckSquare size={18} /> },
      ],
    },
    {
      label: "Insights",
      items: [{ label: "Analytics", href: "/recruit/analytics", icon: <BarChart3 size={18} /> }],
    },
    {
      label: "Account",
      subtle: true,
      autoHide: true,
      items: [{ label: "My settings", href: "/company/my-settings", icon: <Settings size={18} /> }],
    },
  ],
  interviewer: [
    {
      label: "Interviews",
      items: [
        { label: "Home", href: "/home", icon: <House size={18} /> },
        { label: "Interviews", href: "/company/interviews", icon: <ClipboardList size={18} /> },
        {
          label: "Interview prep",
          href: "/recruit/interview-prep",
          icon: <ClipboardList size={18} />,
        },
      ],
    },
  ],
  finance: [
    {
      label: "Finance",
      items: [
        { label: "Home", href: "/home", icon: <House size={18} /> },
        { label: "Finance Inbox", href: "/company/finance", icon: <DollarSign size={18} /> },
      ],
    },
  ],
  agency: [
    {
      label: "Agency",
      items: [
        { label: "Overview", href: "/agency", icon: <LayoutDashboard size={18} /> },
        { label: "Clients", href: "/agency/clients", icon: <Building2 size={18} /> },
        { label: "Client roles", href: "/agency/jobs", icon: <Briefcase size={18} /> },
        { label: "Create client JD", href: "/agency/jobs/new", icon: <Plus size={18} /> },
        { label: "Pipeline", href: "/agency/pipeline", icon: <GitPullRequest size={18} /> },
      ],
    },
    {
      label: "Admin",
      subtle: true,
      autoHide: true,
      items: [{ label: "Team", href: "/agency/team", icon: <Users size={18} /> }],
    },
  ],
  employee: [
    {
      label: "Home",
      items: [{ label: "Employee home", href: "/employee", icon: <House size={18} /> }],
    },
    {
      label: "Refer & Earn",
      items: [{ label: "Refer colleagues", href: "/employee", icon: <Gift size={18} /> }],
    },
    {
      label: "Account",
      subtle: true,
      autoHide: true,
      items: [{ label: "Resign", href: "/employee/resign", icon: <LogOut size={18} /> }],
    },
  ],
  candidate_pro: [
    {
      label: "My Activity",
      items: [
        { label: "Match Feed", href: "/candidate", icon: <Target size={18} /> },
        {
          label: "Status & Scores",
          href: "/candidate/applications",
          icon: <Send size={18} />,
        },
      ],
    },
    {
      label: "Discover",
      items: [
        { label: "Browse Jobs", href: "/candidate/jobs", icon: <Briefcase size={18} /> },
        { label: "Assessments", href: "/candidate/assessments", icon: <CheckSquare size={18} /> },
      ],
    },
    {
      label: "Refer & Earn",
      items: [
        { label: "Refer & Earn", href: "/dashboard/referrer", icon: <Gift size={18} /> },
        { label: "Invite colleagues", href: "/dashboard/referrer/join", icon: <Send size={18} /> },
      ],
    },
    {
      label: "Account",
      subtle: true,
      autoHide: true,
      items: [
        { label: "Profile", href: "/candidate/profile", icon: <UserCircle size={18} /> },
        {
          label: "Preferences",
          href: "/candidate/preferences",
          icon: <SlidersHorizontal size={18} />,
        },
      ],
    },
  ],
  candidate_free: [],
};

NAV_GROUPS_BY_ROLE.candidate_free = NAV_GROUPS_BY_ROLE.candidate_pro;
