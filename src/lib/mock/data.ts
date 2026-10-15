import type { Candidate, Company, JobPosting, FitScore } from "@/types";

export { mockUsers } from "./users";
export { mockOrganisations } from "./organisations";
export { mockCandidates } from "./candidates";
export { mockCompanies } from "./companies";
export { mockJobPostings } from "./job-postings";
export { mockFitScores } from "./fit-scores";
export { mockAgentRuns } from "./agent-runs";
export { mockActivityFeed } from "./activity-feed";

import { mockCandidates } from "./candidates";
import { mockCompanies } from "./companies";
import { mockJobPostings } from "./job-postings";
import { mockFitScores } from "./fit-scores";

export function getCandidateById(id: string): Candidate | undefined {
  return mockCandidates.find((c) => c.id === id);
}

export function getCompanyById(id: string): Company | undefined {
  return mockCompanies.find((c) => c.id === id);
}

export function getJobPostingById(id: string): JobPosting | undefined {
  return mockJobPostings.find((j) => j.id === id);
}

export function getFitScoresForJob(jobId: string): FitScore[] {
  return mockFitScores.filter((fs) => fs.jobPostingId === jobId);
}

export function getFitScoresForCandidate(candidateId: string): FitScore[] {
  return mockFitScores.filter((fs) => fs.candidateId === candidateId);
}

export function getJobPostingsForCompany(companyId: string): JobPosting[] {
  return mockJobPostings.filter((j) => j.companyId === companyId);
}
