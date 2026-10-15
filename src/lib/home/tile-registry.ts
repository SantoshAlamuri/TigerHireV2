import type { ComponentType } from "react";
import type { UserRole } from "@/types/database";
import { EmOpenRolesTile, EmReferralsTile } from "@/components/home/tiles/employee-tiles";
import { FnOffersQueueTile, FnOpenJobsTile } from "@/components/home/tiles/finance-tiles";
import {
  HmHiringRequestsTile,
  HmOwnedJobsTile,
  HmPipelineAwaitingTile,
} from "@/components/home/tiles/hiring-manager-tiles";
import { IvUpcomingTile } from "@/components/home/tiles/interviewer-tiles";
import {
  LhOffers30dTile,
  LhOpenRolesTile,
  LhPipeline7dTile,
  LhReferralLeadersTile,
} from "@/components/home/tiles/leadership-tiles";
import {
  PdHiringVelocityTile,
  PdPendingActionsTile,
  PdPipelineHealthTile,
  PdTimeToHireTile,
} from "@/components/home/tiles/plan-document-tiles";
import {
  RcApplicationsTodayTile,
  RcJobsOpenTile,
  RcPipelineRowsTile,
  RcStalePipelineTile,
} from "@/components/home/tiles/recruiter-tiles";
import { isPlanDocumentNavActive } from "@/lib/navigation/plan-document-nav-filter";

/** Brief 1 — home shell visibility; `is_org_admin` reserved for future tiles that depend on Setup. */
export type HomeTileUserContext = { role: UserRole; is_org_admin: boolean };

/**
 * What a tile is for.
 *
 * `action` means a number this seat is expected to do something about, so Home
 * leads with it. `context` is worth knowing and worth nothing at 9am. Home used
 * to render one undifferentiated grid, which is how "4 candidates waiting on
 * you" ended up sitting below "open roles in your organisation".
 */
export type HomeTileKind = "action" | "context";

export type HomeTileDef = {
  id: string;
  component: ComponentType;
  visibleTo: (user: HomeTileUserContext) => boolean;
  kind: HomeTileKind;
  priority: number;
  minHeight?: "sm" | "md" | "lg";
};

/**
 * Signals a seat's Home cannot check yet, stated rather than rendered as zero.
 *
 * Four tiles used to serve a hardcoded `{ count: 0 }` from the API: pending
 * interview feedback, recent interviews, hires in the last 6 months, and
 * vouches. Two of the interviewer's three tiles were among them, so that seat's
 * entire Home read "nothing needs you" on every load, forever, regardless of
 * what was actually waiting. A screen that cannot check a signal says so; it
 * does not report a zero it never measured.
 */
export const HOME_UNEVALUATED_BY_ROLE: Partial<Record<UserRole, string[]>> = {
  interviewer: ["interview feedback you owe", "interviews you have already done"],
  finance: ["hires in the last six months"],
  employee: ["vouches on your referrals"],
};

const planDocHiringRoles = (role: UserRole) =>
  isPlanDocumentNavActive() &&
  (role === "leadership" || role === "recruiter" || role === "hiring_manager");

export const HOME_TILES: HomeTileDef[] = [
  {
    id: "pd-hiring-velocity",
    component: PdHiringVelocityTile,
    visibleTo: (u) => planDocHiringRoles(u.role),
    kind: "context",
    priority: 5,
  },
  {
    id: "pd-pipeline-health",
    component: PdPipelineHealthTile,
    visibleTo: (u) => planDocHiringRoles(u.role),
    kind: "context",
    priority: 6,
  },
  {
    id: "pd-pending-actions",
    component: PdPendingActionsTile,
    visibleTo: (u) => planDocHiringRoles(u.role),
    kind: "action",
    priority: 7,
  },
  {
    id: "pd-time-to-hire",
    component: PdTimeToHireTile,
    visibleTo: (u) => planDocHiringRoles(u.role),
    kind: "context",
    priority: 8,
  },
  {
    id: "lh-open-roles",
    component: LhOpenRolesTile,
    visibleTo: (u) => u.role === "leadership",
    kind: "context",
    priority: 10,
  },
  {
    id: "lh-pipeline-7d",
    component: LhPipeline7dTile,
    visibleTo: (u) => u.role === "leadership",
    kind: "context",
    priority: 20,
  },
  {
    id: "lh-offers-30d",
    component: LhOffers30dTile,
    visibleTo: (u) => u.role === "leadership",
    kind: "context",
    priority: 30,
  },
  {
    id: "lh-referral-leaders",
    component: LhReferralLeadersTile,
    visibleTo: (u) => u.role === "leadership",
    kind: "context",
    priority: 40,
  },
  {
    id: "rc-applications-today",
    component: RcApplicationsTodayTile,
    visibleTo: (u) => u.role === "recruiter",
    kind: "action",
    priority: 10,
  },
  {
    id: "rc-pipeline-rows",
    component: RcPipelineRowsTile,
    visibleTo: (u) => u.role === "recruiter",
    kind: "context",
    priority: 20,
  },
  {
    id: "rc-jobs-open",
    component: RcJobsOpenTile,
    visibleTo: (u) => u.role === "recruiter",
    kind: "context",
    priority: 30,
  },
  {
    id: "rc-stale-pipeline",
    component: RcStalePipelineTile,
    visibleTo: (u) => u.role === "recruiter",
    kind: "action",
    priority: 40,
  },
  {
    id: "hm-owned-jobs",
    component: HmOwnedJobsTile,
    visibleTo: (u) => u.role === "hiring_manager",
    kind: "context",
    priority: 10,
  },
  {
    id: "hm-pipeline-awaiting",
    component: HmPipelineAwaitingTile,
    visibleTo: (u) => u.role === "hiring_manager",
    kind: "action",
    priority: 20,
  },
  {
    id: "hm-hiring-requests",
    component: HmHiringRequestsTile,
    visibleTo: (u) => u.role === "hiring_manager",
    kind: "action",
    priority: 30,
  },
  {
    id: "iv-upcoming",
    component: IvUpcomingTile,
    visibleTo: (u) => u.role === "interviewer",
    kind: "action",
    priority: 10,
  },
  {
    id: "fn-offers-queue",
    component: FnOffersQueueTile,
    visibleTo: (u) => u.role === "finance",
    kind: "action",
    priority: 10,
  },
  {
    id: "fn-open-jobs",
    component: FnOpenJobsTile,
    visibleTo: (u) => u.role === "finance",
    kind: "context",
    priority: 20,
  },
  {
    id: "em-referrals",
    component: EmReferralsTile,
    visibleTo: (u) => u.role === "employee",
    kind: "context",
    priority: 10,
  },
  {
    id: "em-open-roles",
    component: EmOpenRolesTile,
    visibleTo: (u) => u.role === "employee",
    kind: "context",
    priority: 20,
  },
];
