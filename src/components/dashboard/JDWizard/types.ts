export type SectionType = "text" | "list" | "tags";

export interface JdSection {
  id: string;
  label: string;
  type: SectionType;
  value: string | string[];
}

export interface DynamicJdSections {
  version: 2;
  sections: JdSection[];
}

export interface WizardMetadata {
  title: string;
  location: string;
  roleFunction: string;
  seniorityLevel: string;
  remoteAllowed: boolean;
  compensationMin: number | undefined;
  compensationMax: number | undefined;
  experienceMin: number | null;
  experienceMax: number | null;
  summary: string;
  /** Defaults to true when missing (e.g. after AI parse). */
  listOnPublicJobBoard?: boolean;
  listForInternalReferrals?: boolean;
  /** Local datetime string from `<input type="datetime-local" />`, or ISO; optional. */
  applicationsCloseAt?: string;
}

export interface ParsedWizardData {
  metadata: WizardMetadata;
  sections: JdSection[];
  rawText: string;
}

export type WizardStep = 1 | 2 | 3;

export type WizardRole = "company" | "recruiter" | "agency";
