export interface AgencyStage {
  key: string;
  label: string;
  order: number;
  color: string;
  bg: string;
}

export const AGENCY_STAGES: AgencyStage[] = [
  {
    key: "interest_received",
    label: "Interest Received",
    order: 1,
    color: "text-sky-400",
    bg: "bg-sky-500/15",
  },
  {
    key: "shared_with_company",
    label: "Shared with Company",
    order: 2,
    color: "text-violet-400",
    bg: "bg-violet-500/15",
  },
  {
    key: "shortlisted",
    label: "Shortlisted",
    order: 3,
    color: "text-amber-400",
    bg: "bg-amber-500/15",
  },
  {
    key: "interview",
    label: "Interview",
    order: 4,
    color: "text-blue-400",
    bg: "bg-blue-500/15",
  },
  {
    key: "final_round",
    label: "Final Round",
    order: 5,
    color: "text-indigo-400",
    bg: "bg-indigo-500/15",
  },
  {
    key: "offered",
    label: "Offered",
    order: 6,
    color: "text-emerald-400",
    bg: "bg-emerald-500/15",
  },
  {
    key: "joined",
    label: "Candidate Joined",
    order: 7,
    color: "text-green-400",
    bg: "bg-green-500/15",
  },
];

export const AGENCY_STAGE_KEYS = AGENCY_STAGES.map((s) => s.key);

export const AGENCY_STAGE_MAP = new Map(AGENCY_STAGES.map((s) => [s.key, s]));

export const DEFAULT_AGENCY_STAGE = "interest_received";

const SHARED_WITH_COMPANY_ORDER =
  AGENCY_STAGE_MAP.get("shared_with_company")?.order ?? Number.MAX_SAFE_INTEGER;

/** Application sources that mean the agency uploaded the CV (not a direct/public apply). */
export function isAgencyUploadedApplicationSource(source: string | null | undefined): boolean {
  return source === "agency_upload";
}

/** Company/HM pipeline should only show agency-uploaded candidates at shared_with_company or later. */
export function isAgencyStageVisibleToCompany(agencyStage: string | null | undefined): boolean {
  if (!agencyStage) return false;
  const stage = AGENCY_STAGE_MAP.get(agencyStage);
  if (!stage) return false;
  return stage.order >= SHARED_WITH_COMPANY_ORDER;
}
