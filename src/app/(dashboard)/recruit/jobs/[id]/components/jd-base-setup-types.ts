import type { JdBaseWizardStructuredJd } from "@/components/fitscore/jd-base/JdBaseApprovalWizard";
import type {
  FitThresholds,
  IdealCandidateProfile,
  ScoringWeights,
} from "@/lib/fitscore/hybrid/types";
export type JdBasePayload = {
  id: string;
  jobId: string;
  roleTitle: string;
  company: string;
  context: string;
  weights: ScoringWeights;
  scoreFloor: number;
  fitThresholds: FitThresholds;
  extractionAdditions?: string | null;
  idealCandidateProfile?: IdealCandidateProfile | null;
  structuredJd?: JdBaseWizardStructuredJd;
  approvedBy?: string | null;
  approvedAt?: string | null;
  scoringFoundation?: "india_template" | "llm";
  indiaTemplateId?: string | null;
  indiaTemplateCategory?: string | null;
  indiaTemplateRoleTitle?: string | null;
};
