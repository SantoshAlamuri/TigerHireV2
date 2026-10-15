export type CandidateProfileApplication = {
  job_title: string;
  organisation_name: string;
  applied_at: string;
  status: string;
  fit_score: number | null;
};

export type CandidateProfileReferrerLink = {
  job_title: string;
  apply_url: string;
};

export type CandidateProfileResponse = {
  candidate: {
    id: string;
    name: string | null;
    phone: string | null;
    email: string | null;
  };
  applications: CandidateProfileApplication[];
  referrer: null | {
    id: string;
    links: CandidateProfileReferrerLink[];
    pending_inr: number;
    paid_inr: number;
  };
};
