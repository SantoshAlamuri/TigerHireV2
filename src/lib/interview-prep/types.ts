export interface PrepQueueItem {
  pipelineCandidateId: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  currentRole: string | null;
  location: string | null;
  experienceYears: number | null;
  jobId: string;
  jobTitle: string;
  roleFunction: string | null;
  stageName: string;
  scheduledAt: string;
  overallScore: number | null;
  band: string | null;
  confidence: string | null;
  summary: string | null;
  strengths: string[];
  greenFlags: string[];
  redFlags: string[];
  pendingAssessments: number;
  submittedAssessments: number;
  scoredAssessments: number;
  feedbackCount: number;
  latestFeedbackAt: string | null;
  latestRecommendation: string | null;
  prepPriority: "critical" | "high" | "medium";
}

export interface PrepPackSection {
  title: string;
  points: string[];
}

export interface PrepPackTemplate {
  id?: string;
  key: string;
  title: string;
  whenToUse: string;
  objective: string;
  questionTracks: string[];
  rubric: string[];
  roleFunction?: string | null;
  stageName?: string | null;
  source: "saved" | "suggested";
}

export interface PrepPack {
  queueItem: PrepQueueItem;
  candidate: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    location: string | null;
    experienceYears: number | null;
    skills: string[];
  };
  job: {
    id: string;
    title: string;
    roleFunction: string | null;
    compensationMin: number | null;
    compensationMax: number | null;
  };
  stage: {
    name: string;
    scheduledAt: string;
    objective: string;
  };
  fitScore: {
    overallScore: number | null;
    band: string | null;
    confidence: string | null;
    summary: string | null;
    strengths: string[];
    greenFlags: string[];
    redFlags: string[];
  };
  assessments: {
    pendingCount: number;
    submittedCount: number;
    scoredCount: number;
    recent: Array<{
      id: string;
      title: string;
      type: string;
      status: string;
      deadlineAt: string;
      score: number | null;
      maxScore: number | null;
    }>;
  };
  feedback: {
    count: number;
    avgRating: number | null;
    latestRecommendation: string | null;
    latestNotes: string[];
    recommendationBreakdown: Record<string, number>;
  };
  prepSections: PrepPackSection[];
  templates: PrepPackTemplate[];
}

export interface InterviewPrepResponse {
  queue: PrepQueueItem[];
  selectedPack: PrepPack | null;
  studioTemplates: PrepPackTemplate[];
  /** Roles that currently have at least one upcoming interview in prep scope (for filters). */
  scope?: {
    roles: Array<{ id: string; title: string }>;
  };
}

export interface InterviewPrepTemplateLibraryResponse {
  templates: PrepPackTemplate[];
  canManageTemplates: boolean;
  warning?: string;
}
