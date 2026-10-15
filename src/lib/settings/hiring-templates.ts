export type HiringTemplateTab = "requisition" | "offer-letters" | "feedback" | "assessments";

export const HIRING_TEMPLATE_TABS: ReadonlyArray<{
  id: HiringTemplateTab;
  label: string;
  description: string;
}> = [
  {
    id: "requisition",
    label: "Requisition",
    description: "Reusable hiring request and JD templates.",
  },
  {
    id: "offer-letters",
    label: "Offer letters",
    description: "PDF/HTML bodies and merge fields for offers.",
  },
  {
    id: "feedback",
    label: "Interview feedback",
    description: "Interviewer scorecards attached to pipeline stages.",
  },
  {
    id: "assessments",
    label: "Assessments",
    description: "Written and take-home packs reused across roles.",
  },
] as const;

export function parseHiringTemplateTab(value: string | null): HiringTemplateTab {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "offer" || normalized === "offer_letters" || normalized === "offer-letter") {
    return "offer-letters";
  }
  if (HIRING_TEMPLATE_TABS.some((tab) => tab.id === normalized)) {
    return normalized as HiringTemplateTab;
  }
  return "requisition";
}

export function hiringTemplatesPath(basePath: string, tab?: HiringTemplateTab): string {
  const path = `${basePath.replace(/\/$/, "")}/templates`;
  return tab ? `${path}?tab=${tab}` : path;
}
