export type ReferralStageKey =
  | "invited"
  | "applied"
  | "screened"
  | "shortlisted"
  | "interview"
  | "offer"
  | "rejected";

const STAGE_LABELS: Record<ReferralStageKey, string> = {
  invited: "Invite sent",
  applied: "Applied",
  screened: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  offer: "Hired",
  rejected: "Rejected",
};

export function stageLabel(key: ReferralStageKey): string {
  return STAGE_LABELS[key] ?? key;
}

export function employeeInviteStatusToStage(status: string): ReferralStageKey {
  const s = status.toLowerCase();
  if (s === "rejected") return "rejected";
  if (s === "hired") return "offer";
  if (s === "interviewed") return "interview";
  if (s === "shortlisted") return "shortlisted";
  if (s === "scored") return "screened";
  if (s === "cv_received") return "applied";
  return "invited";
}

export function applicationStatusToStage(status: string): ReferralStageKey {
  const s = status.toLowerCase();
  if (s === "rejected" || s === "withdrawn") return "rejected";
  if (s === "hired") return "offer";
  if (s === "shortlisted") return "shortlisted";
  if (s === "viewed") return "screened";
  return "applied";
}

export function stagePillClass(key: ReferralStageKey): string {
  switch (key) {
    case "offer":
      return "border-emerald-500/35 bg-emerald-500/12 text-emerald-300";
    case "rejected":
      return "border-red-500/35 bg-red-500/12 text-red-300";
    case "shortlisted":
    case "interview":
      return "border-amber-500/35 bg-amber-500/12 text-amber-200";
    case "applied":
    case "screened":
      return "border-sky-500/35 bg-sky-500/12 text-sky-300";
    default:
      return "border-white/15 bg-white/[0.05] text-white/65";
  }
}
