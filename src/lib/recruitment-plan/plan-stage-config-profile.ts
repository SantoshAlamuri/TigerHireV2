import type { PlanStageFormat, PlanStageRow, PlanStageType } from "./types";

export type StageConfigField =
  | "display_name"
  | "stage_type"
  | "target_dwell_days"
  | "primary_interviewer"
  | "backup_interviewer"
  | "duration_minutes"
  | "format"
  | "scorecard_template"
  | "comms_template";

export type StageSetupStatus = "ready" | "needs_setup";

export type PlanStageConfigProfile = {
  typeLabel: string;
  purpose: string;
  oneTimeHint: string;
  fields: StageConfigField[];
};

const PROFILES: Record<PlanStageType, PlanStageConfigProfile> = {
  application_review: {
    typeLabel: "Application review",
    purpose: "How long candidates may sit in review before moving on.",
    oneTimeHint:
      "Set once for this step. Every candidate who enters Application review uses these defaults.",
    fields: ["display_name", "stage_type", "target_dwell_days"],
  },
  phone_screen: {
    typeLabel: "Phone screen",
    purpose: "Screening call length, channel, and how candidates are invited.",
    oneTimeHint:
      "Set once for this phone screen round. WhatsApp or email invites reuse these settings.",
    fields: [
      "display_name",
      "stage_type",
      "target_dwell_days",
      "duration_minutes",
      "format",
      "comms_template",
      "scorecard_template",
    ],
  },
  interview: {
    typeLabel: "Interview",
    purpose: "Who runs the round, how long it runs, and how feedback is captured.",
    oneTimeHint:
      "Set once per interview round (e.g. Technical vs HM). Scheduling and scorecards follow this setup.",
    fields: [
      "display_name",
      "stage_type",
      "target_dwell_days",
      "primary_interviewer",
      "backup_interviewer",
      "duration_minutes",
      "format",
      "scorecard_template",
      "comms_template",
    ],
  },
  assessment: {
    typeLabel: "Assessment",
    purpose: "Take-home or async evaluation defaults for this round.",
    oneTimeHint:
      "Set once for this assessment step. Candidates inherit duration and scorecard rules.",
    fields: [
      "display_name",
      "stage_type",
      "target_dwell_days",
      "duration_minutes",
      "format",
      "scorecard_template",
    ],
  },
  approval: {
    typeLabel: "Approval gate",
    purpose: "Shortlist or sign-off timing before candidates advance.",
    oneTimeHint:
      "Set once for this approval step. Approvers see work in Tasks when someone is ready.",
    fields: ["display_name", "stage_type", "target_dwell_days"],
  },
  offer: {
    typeLabel: "Offer",
    purpose: "Offer stage pacing and candidate communications.",
    oneTimeHint: "Set once for the offer step. Finance and HM decisions still flow through Tasks.",
    fields: ["display_name", "stage_type", "target_dwell_days", "comms_template"],
  },
  custom: {
    typeLabel: "Custom step",
    purpose: "Flexible round — configure only what this step needs.",
    oneTimeHint: "Set once for this custom step. You can leave optional fields empty.",
    fields: [
      "display_name",
      "stage_type",
      "target_dwell_days",
      "primary_interviewer",
      "duration_minutes",
      "format",
      "scorecard_template",
      "comms_template",
    ],
  },
};

export function getPlanStageConfigProfile(stageType: PlanStageType): PlanStageConfigProfile {
  return PROFILES[stageType];
}

function hasComms(stage: PlanStageRow): boolean {
  const id = stage.comms_template_id?.trim();
  const legacy = stage.comms_template?.trim();
  return Boolean(id || legacy);
}

function isRequired(field: StageConfigField, stage: PlanStageRow): boolean {
  switch (field) {
    case "display_name":
      return !stage.display_name?.trim();
    case "target_dwell_days":
      return stage.target_dwell_days == null || stage.target_dwell_days < 0;
    case "primary_interviewer":
      return stage.stage_type === "interview" && !stage.primary_interviewer_id;
    case "duration_minutes":
      return (
        (stage.stage_type === "interview" || stage.stage_type === "phone_screen") &&
        !stage.duration_minutes
      );
    case "format":
      return (
        (stage.stage_type === "interview" || stage.stage_type === "phone_screen") && !stage.format
      );
    case "scorecard_template":
      return (
        (stage.stage_type === "interview" || stage.stage_type === "assessment") &&
        !stage.scorecard_template_id
      );
    case "comms_template":
      return stage.stage_type === "phone_screen" && !hasComms(stage);
    default:
      return false;
  }
}

export function getStageSetupStatus(stage: PlanStageRow): StageSetupStatus {
  const profile = getPlanStageConfigProfile(stage.stage_type);
  for (const field of profile.fields) {
    if (isRequired(field, stage)) return "needs_setup";
  }
  return "ready";
}

export function getStageSetupSummary(stage: PlanStageRow): string {
  const profile = getPlanStageConfigProfile(stage.stage_type);
  const parts: string[] = [];

  if (stage.duration_minutes && profile.fields.includes("duration_minutes")) {
    parts.push(`${stage.duration_minutes}m`);
  }
  if (stage.format && profile.fields.includes("format")) {
    parts.push(stage.format.replace(/_/g, " "));
  }
  if (stage.primary_interviewer_id && profile.fields.includes("primary_interviewer")) {
    parts.push("Interviewer assigned");
  }
  if (stage.scorecard_template_id && profile.fields.includes("scorecard_template")) {
    parts.push("Scorecard linked");
  }
  if (hasComms(stage) && profile.fields.includes("comms_template")) {
    parts.push("Invite template set");
  }
  if (stage.target_dwell_days != null && profile.fields.includes("target_dwell_days")) {
    parts.push(`${stage.target_dwell_days}d target`);
  }

  if (parts.length === 0) return "Not configured yet";
  return parts.join(" · ");
}

export function countStagesNeedingSetup(stages: PlanStageRow[]): {
  ready: number;
  needsSetup: number;
} {
  let ready = 0;
  let needsSetup = 0;
  for (const s of stages) {
    if (getStageSetupStatus(s) === "ready") ready += 1;
    else needsSetup += 1;
  }
  return { ready, needsSetup };
}
