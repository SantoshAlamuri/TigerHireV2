export type PendingShortlistApproval = {
  id: string;
  job_id: string;
  candidate_id: string;
  status: string;
  stage_id?: string | null;
  created_at: string;
  candidates?: {
    id: string;
    name: string | null;
    email: string | null;
    skills: string[] | null;
    location: string | null;
  } | null;
  jobTitle: string;
  fitScore: number | null;
  fitBand: string | null;
  approvals: Array<{
    approver_role: string;
    decision: string;
    decided_at: string;
    notes: string | null;
  }>;
  commentPreview: string | null;
};

export type PendingRequisitionApproval = {
  id: string;
  requestId: string;
  requestTitle: string;
  reqCode: string | null;
  department: string | null;
  urgency: string | null;
  status: string | null;
  headcount: number | null;
  budgetCtcMin: number | null;
  budgetCtcMax: number | null;
  stageKey: string;
  approverRole: string | null;
  slaDueAt: string | null;
  createdAt: string;
  createdById: string | null;
  commentPreview: string | null;
};

export type PendingOfferFinanceApproval = {
  id: string;
  offerId: string;
  roleTitle: string;
  offerStatus: string | null;
  jobTitle: string | null;
  candidateName: string | null;
  createdAt: string;
  createdById: string | null;
  commentPreview: string | null;
  jobId: string | null;
  ctc: number | null;
  currency: string | null;
};

export type ApprovalTaskItem =
  | {
      id: string;
      source: "candidate_shortlist";
      createdAt: string;
      payload: PendingShortlistApproval;
    }
  | {
      id: string;
      source: "hiring_request";
      createdAt: string;
      payload: PendingRequisitionApproval;
    }
  | {
      id: string;
      source: "offer_finance";
      createdAt: string;
      payload: PendingOfferFinanceApproval;
    };

export type ApprovalTaskSource = ApprovalTaskItem["source"];
