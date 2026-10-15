import { NextRequest } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getAuthContext,
  handleApiError,
  hasRole,
  jsonError,
  jsonSuccess,
  requireAuth,
} from "@/lib/api-helpers";
import type {
  InterviewPrepResponse,
  PrepPack,
  PrepPackSection,
  PrepPackTemplate,
  PrepQueueItem,
} from "@/lib/interview-prep/types";

type CandidateSource = {
  id: string;
  name: string | null;
  email: string | null;
  skills: string[] | string | null;
  location: string | null;
  experience_years: number | null;
  current_role: string | null;
};

type PipelineRow = {
  id: string;
  job_id: string;
  candidate_id: string;
  stage_id: string | null;
  interview_scheduled_at: string | null;
  interview_outcome: string | null;
};

type JobRow = {
  id: string;
  title: string | null;
  organisation_id: string | null;
  compensation_min: number | null;
  compensation_max: number | null;
  role_function: string | null;
  hiring_manager_id: string | null;
};

type FitScoreRow = {
  job_id: string;
  candidate_id: string;
  overall_score: number | null;
  one_line_summary: string | null;
  key_strengths: string[] | null;
  confidence: string | null;
  band: string | null;
  green_flags: string[] | null;
  red_flags: string[] | null;
};

type AssessmentRow = {
  id: string;
  application_id: string;
  title: string;
  type: string;
  status: string;
  deadline_at: string;
  score: number | null;
  max_score: number | null;
};

type FeedbackRow = {
  pipeline_candidate_id: string;
  overall_rating: number | null;
  recommendation: string | null;
  notes: string | null;
  created_at: string;
};

type PrepTemplateRow = {
  id: string;
  organisation_id: string;
  role_function: string | null;
  stage_name: string | null;
  title: string;
  when_to_use: string;
  objective: string;
  question_tracks: string[] | null;
  rubric: string[] | null;
};

function normalizeCandidate(
  candidateSource: CandidateSource | CandidateSource[] | null | undefined,
): CandidateSource | null {
  if (!candidateSource) return null;
  if (Array.isArray(candidateSource)) return candidateSource[0] ?? null;
  return candidateSource;
}

function normalizeSkills(skills: CandidateSource["skills"]): string[] {
  if (Array.isArray(skills)) return skills.filter(Boolean);
  if (typeof skills === "string") {
    return skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }
  return [];
}

function isMissingInterviewPrepTemplatesSchema(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? "");
  const message = String((error as { message?: string } | null)?.message ?? "");
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes('relation "interview_prep_templates" does not exist') ||
    message.includes("column interview_prep_templates.")
  );
}

function stageObjective(stageName: string): string {
  const normalized = stageName.toLowerCase();
  if (normalized.includes("screen"))
    return "Validate baseline fit and confirm the candidate should move deeper.";
  if (normalized.includes("manager"))
    return "Pressure-test ownership, judgment, and role-specific execution depth.";
  if (normalized.includes("final"))
    return "Close remaining decision risk and confirm hire/no-hire confidence.";
  if (normalized.includes("culture"))
    return "Check team fit, communication style, and collaboration patterns.";
  return "Use this round to validate the strongest remaining unknowns for the role.";
}

function prepPriorityFor(item: {
  redFlags: string[];
  pendingAssessments: number;
  feedbackCount: number;
  scheduledAt: string;
}): "critical" | "high" | "medium" {
  const timeToInterview = new Date(item.scheduledAt).getTime() - Date.now();
  if (
    item.redFlags.length > 0 ||
    (item.pendingAssessments > 0 && timeToInterview < 24 * 60 * 60 * 1000)
  ) {
    return "critical";
  }
  if (
    item.feedbackCount === 0 ||
    item.pendingAssessments > 0 ||
    timeToInterview < 48 * 60 * 60 * 1000
  ) {
    return "high";
  }
  return "medium";
}

function buildQuestionTracks(
  stageName: string,
  roleFunction: string | null,
  currentRole: string | null,
): string[] {
  const roleLabel = roleFunction ?? currentRole ?? "the target role";
  const stageLabel = stageName.toLowerCase();
  const questions = [
    `Ask the candidate to walk through a recent project most relevant to ${roleLabel}.`,
    `Probe for trade-offs they made when priorities conflicted in ${roleLabel} work.`,
  ];

  if (stageLabel.includes("screen")) {
    questions.push("Confirm baseline communication, motivation, and role understanding.");
  } else if (stageLabel.includes("final")) {
    questions.push("Test ownership, decision quality, and any unresolved hire risks.");
  } else {
    questions.push(
      "Use the round to validate depth, collaboration style, and execution consistency.",
    );
  }

  return questions;
}

function buildRubric(stageName: string): string[] {
  const stageLabel = stageName.toLowerCase();
  if (stageLabel.includes("screen")) {
    return ["Signal strength", "Communication clarity", "Motivation and intent"];
  }
  if (stageLabel.includes("final")) {
    return ["Decision quality", "Leadership and ownership", "Risk profile"];
  }
  return ["Role depth", "Problem solving", "Collaboration quality"];
}

function buildPrepSections(pack: {
  queueItem: PrepQueueItem;
  pendingAssessments: number;
  submittedAssessments: number;
  latestNotes: string[];
  skills: string[];
}): PrepPackSection[] {
  const sections: PrepPackSection[] = [
    {
      title: "Round objective",
      points: [stageObjective(pack.queueItem.stageName)],
    },
    {
      title: "Candidate signal",
      points: [
        pack.queueItem.summary ||
          "No FitScore summary yet. Use this round to gather first-hand evidence.",
        ...(pack.queueItem.strengths.length > 0
          ? pack.queueItem.strengths.slice(0, 3).map((item) => `Strength: ${item}`)
          : ["No structured strengths recorded yet. Lean on role-depth questions."]),
      ],
    },
  ];

  const validationPoints = [
    ...(pack.queueItem.redFlags.length > 0
      ? pack.queueItem.redFlags.slice(0, 3).map((flag) => `Follow up on: ${flag}`)
      : []),
    ...(pack.pendingAssessments > 0
      ? [
          `${pack.pendingAssessments} assessment${pack.pendingAssessments === 1 ? "" : "s"} still pending completion.`,
        ]
      : []),
    ...(pack.submittedAssessments > 0
      ? [
          `${pack.submittedAssessments} assessment submission${pack.submittedAssessments === 1 ? "" : "s"} waiting to be interpreted.`,
        ]
      : []),
    ...(pack.latestNotes.length > 0
      ? pack.latestNotes.slice(0, 2).map((note) => `Past feedback theme: ${note}`)
      : []),
    ...(pack.skills.length > 0
      ? [`Anchor questions in these skills: ${pack.skills.slice(0, 4).join(", ")}.`]
      : []),
  ];

  sections.push({
    title: "What still needs proof",
    points:
      validationPoints.length > 0
        ? validationPoints
        : ["No major gaps recorded. Focus on decision confidence and role-specific depth."],
  });

  return sections;
}

function buildTemplates(queueItem: PrepQueueItem): PrepPackTemplate[] {
  const questionTracks = buildQuestionTracks(
    queueItem.stageName,
    queueItem.roleFunction,
    queueItem.currentRole,
  );
  const rubric = buildRubric(queueItem.stageName);

  return [
    {
      key: "role-depth",
      title: "Role depth track",
      whenToUse: "Best when you need to confirm execution quality in the target function.",
      objective: `Verify the candidate can operate effectively in ${queueItem.roleFunction ?? queueItem.jobTitle}.`,
      questionTracks,
      rubric,
      roleFunction: queueItem.roleFunction,
      stageName: queueItem.stageName,
      source: "suggested",
    },
    {
      key: "risk-follow-up",
      title: "Risk follow-up track",
      whenToUse: "Use this when FitScore flags or pending assessments leave unresolved concerns.",
      objective: "Turn red flags and open signals into explicit validation points.",
      questionTracks: [
        ...(queueItem.redFlags.length > 0
          ? queueItem.redFlags.slice(0, 3).map((flag) => `Ask for evidence that addresses: ${flag}`)
          : ["Ask for concrete examples that prove consistency under pressure."]),
        "Probe how the candidate handled setbacks, ambiguity, and competing priorities.",
      ],
      rubric: ["Risk ownership", "Evidence quality", "Consistency under pressure"],
      roleFunction: queueItem.roleFunction,
      stageName: queueItem.stageName,
      source: "suggested",
    },
    {
      key: "decision-ready",
      title: "Decision-ready panel",
      whenToUse:
        "Use this for later rounds where the team needs a clean hire/no-hire recommendation.",
      objective: "Collect the final evidence required to make a confident decision.",
      questionTracks: [
        "Ask what the first 30-60-90 days would look like in this role.",
        "Probe stakeholder management, ownership boundaries, and escalation judgment.",
        "Close on compensation, timing, and genuine motivation for the move.",
      ],
      rubric: ["Decision confidence", "Ownership and judgment", "Role readiness"],
      roleFunction: queueItem.roleFunction,
      stageName: queueItem.stageName,
      source: "suggested",
    },
  ];
}

function savedTemplateMatches(
  template: PrepTemplateRow,
  organisationId: string | null,
  roleFunction: string | null,
  stageName: string,
): boolean {
  const roleMatch =
    !template.role_function ||
    (roleFunction ? template.role_function.toLowerCase() === roleFunction.toLowerCase() : false);
  const stageMatch =
    !template.stage_name || template.stage_name.toLowerCase() === stageName.toLowerCase();
  return template.organisation_id === organisationId && roleMatch && stageMatch;
}

function toSavedTemplate(row: PrepTemplateRow): PrepPackTemplate {
  return {
    id: row.id,
    key: row.id,
    title: row.title,
    whenToUse: row.when_to_use,
    objective: row.objective,
    questionTracks: row.question_tracks ?? [],
    rubric: row.rubric ?? [],
    roleFunction: row.role_function,
    stageName: row.stage_name,
    source: "saved",
  };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "leadership", "recruiter", "hiring_manager", "interviewer", "super_admin")) {
      return jsonError("Forbidden", 403);
    }
    // Anti-anchoring (#354): an interviewer must not see the AI verdict/score or
    // peers' prior feedback before they submit — it biases their own judgement.
    // Recruiters/HMs/leadership keep the full aggregate view.
    const isInterviewer = ctx.role === "interviewer";

    const searchParams = new URL(request.url).searchParams;
    const requestedPipelineCandidateId = searchParams.get("pipelineCandidateId");
    const requestedJobIdRaw = searchParams.get("jobId");
    const requestedJobId =
      requestedJobIdRaw && requestedJobIdRaw.trim().length > 0 ? requestedJobIdRaw.trim() : null;

    const supabase = await createSupabaseServerClient();
    const admin = createSupabaseAdmin();

    let jobs: JobRow[] = [];
    let stageNameMap = new Map<string, string>();
    let pipelineRows: PipelineRow[] = [];

    const pipelineSelect =
      "id, job_id, candidate_id, stage_id, interview_scheduled_at, interview_outcome";
    const jobSelect =
      "id, title, organisation_id, compensation_min, compensation_max, role_function, hiring_manager_id";

    if (ctx.role === "interviewer") {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const interviewerEmail = user?.email?.trim().toLowerCase() ?? "";

      const byUidRes = await admin
        .from("pipeline_stages")
        .select("id, stage_name, job_id")
        .eq("interviewer_user_id", ctx.userId);
      if (byUidRes.error) throw byUidRes.error;

      const byEmailRes = interviewerEmail
        ? await admin
            .from("pipeline_stages")
            .select("id, stage_name, job_id")
            .ilike("interviewer_email", interviewerEmail)
        : { data: [] as Record<string, unknown>[], error: null as null };
      if (byEmailRes.error) throw byEmailRes.error;

      const assignedById = new Map<
        string,
        { id: string; stage_name: string | null; job_id: string }
      >();
      for (const row of [...(byUidRes.data ?? []), ...(byEmailRes.data ?? [])]) {
        assignedById.set(row.id as string, {
          id: row.id as string,
          stage_name: (row.stage_name as string | null) ?? null,
          job_id: row.job_id as string,
        });
      }
      const assignedStages = [...assignedById.values()];
      if (assignedStages.length === 0) {
        return jsonSuccess<InterviewPrepResponse>({
          queue: [],
          selectedPack: null,
          studioTemplates: [],
          scope: { roles: [] },
        });
      }

      stageNameMap = new Map(
        assignedStages.map((stage) => [stage.id, stage.stage_name ?? "Interview"]),
      );

      const stageIds = assignedStages.map((stage) => stage.id);
      const jobIdsForInterviewer = [...new Set(assignedStages.map((stage) => stage.job_id))];

      const [pipelineRes, jobsRes] = await Promise.all([
        admin
          .from("pipeline_candidates")
          .select(pipelineSelect)
          .in("stage_id", stageIds)
          .not("interview_scheduled_at", "is", null)
          .order("interview_scheduled_at", { ascending: true }),
        admin.from("jobs").select(jobSelect).in("id", jobIdsForInterviewer),
      ]);
      if (pipelineRes.error) throw pipelineRes.error;
      if (jobsRes.error) throw jobsRes.error;

      pipelineRows = (pipelineRes.data ?? []) as PipelineRow[];
      jobs = (jobsRes.data ?? []) as JobRow[];
    } else {
      if (!ctx.organisationId) return jsonError("No organisation context", 400);

      let jobQuery = admin.from("jobs").select(jobSelect);

      if (ctx.role === "hiring_manager") {
        jobQuery = jobQuery.eq("hiring_manager_id", ctx.userId);
      } else {
        jobQuery = jobQuery.eq("organisation_id", ctx.organisationId);
      }

      const { data: jobsData, error: jobsError } = await jobQuery;
      if (jobsError) throw jobsError;
      if (!jobsData || jobsData.length === 0) {
        return jsonSuccess<InterviewPrepResponse>({
          queue: [],
          selectedPack: null,
          studioTemplates: [],
          scope: { roles: [] },
        });
      }

      jobs = jobsData as JobRow[];
      const jobIds = jobs.map((job) => job.id);

      const { data: pipelineData, error: pipelineError } = await admin
        .from("pipeline_candidates")
        .select(pipelineSelect)
        .in("job_id", jobIds)
        .not("interview_scheduled_at", "is", null)
        .order("interview_scheduled_at", { ascending: true });
      if (pipelineError) throw pipelineError;

      pipelineRows = (pipelineData ?? []) as PipelineRow[];

      const stageIds = [
        ...new Set(
          pipelineRows
            .map((row) => row.stage_id)
            .filter((value): value is string => Boolean(value)),
        ),
      ];
      if (stageIds.length > 0) {
        const { data: stages, error: stagesError } = await admin
          .from("pipeline_stages")
          .select("id, stage_name")
          .in("id", stageIds);
        if (stagesError) throw stagesError;
        stageNameMap = new Map(
          (stages ?? []).map((stage) => [
            stage.id as string,
            (stage.stage_name as string | null) ?? "Interview",
          ]),
        );
      }
    }

    const pipelineCandidateIdsForFetch = [
      ...new Set(pipelineRows.map((r) => r.candidate_id).filter(Boolean)),
    ];
    const candidateById = new Map<string, CandidateSource>();
    if (pipelineCandidateIdsForFetch.length > 0) {
      const { data: candRows, error: candErr } = await admin
        .from("candidates")
        .select("id, name, email, skills, location, experience_years, current_role")
        .in("id", pipelineCandidateIdsForFetch);
      if (candErr) throw candErr;
      for (const row of candRows ?? []) {
        candidateById.set(row.id as string, row as CandidateSource);
      }
    }

    const futurePipelineRows = pipelineRows.filter((row) => {
      if (!row.interview_scheduled_at || row.interview_outcome) return false;
      return new Date(row.interview_scheduled_at).getTime() > Date.now();
    });

    const jobMap = new Map(jobs.map((job) => [job.id, job]));

    const scopeRoleMap = new Map<string, string>();
    for (const row of futurePipelineRows) {
      if (!scopeRoleMap.has(row.job_id)) {
        const job = jobMap.get(row.job_id);
        scopeRoleMap.set(row.job_id, job?.title ?? "Role");
      }
    }
    const scopeRoles = [...scopeRoleMap.entries()]
      .map(([id, title]) => ({ id, title }))
      .sort((a, b) => a.title.localeCompare(b.title));

    if (futurePipelineRows.length === 0) {
      return jsonSuccess<InterviewPrepResponse>({
        queue: [],
        selectedPack: null,
        studioTemplates: [],
        scope: { roles: [] },
      });
    }

    const activePipelineRows = requestedJobId
      ? futurePipelineRows.filter((row) => row.job_id === requestedJobId)
      : futurePipelineRows;

    if (activePipelineRows.length === 0) {
      return jsonSuccess<InterviewPrepResponse>({
        queue: [],
        selectedPack: null,
        studioTemplates: [],
        scope: { roles: scopeRoles },
      });
    }

    const pipelineCandidateIds = activePipelineRows.map((row) => row.id);
    const candidateIds = [...new Set(activePipelineRows.map((row) => row.candidate_id))];
    const jobIds = [...new Set(activePipelineRows.map((row) => row.job_id))];
    const organisationIds = [
      ...new Set(
        jobs.map((job) => job.organisation_id).filter((value): value is string => Boolean(value)),
      ),
    ];

    const [scoresRes, applicationsRes, feedbackRes, prepTemplatesRes] = await Promise.all([
      admin
        .from("fit_scores")
        .select(
          "job_id, candidate_id, overall_score, one_line_summary, key_strengths, confidence, band, green_flags, red_flags",
        )
        .in("job_id", jobIds)
        .in("candidate_id", candidateIds)
        .or("is_test_run.eq.false,is_test_run.is.null"),
      admin
        .from("applications")
        .select("id, candidate_id, job_id")
        .in("job_id", jobIds)
        .in("candidate_id", candidateIds),
      admin
        .from("feedback_responses")
        .select("pipeline_candidate_id, overall_rating, recommendation, notes, created_at")
        .in("pipeline_candidate_id", pipelineCandidateIds)
        .order("created_at", { ascending: false }),
      organisationIds.length > 0
        ? admin
            .from("interview_prep_templates")
            .select(
              "id, organisation_id, role_function, stage_name, title, when_to_use, objective, question_tracks, rubric",
            )
            .in("organisation_id", organisationIds)
            .eq("is_active", true)
            .order("updated_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (scoresRes.error) throw scoresRes.error;
    if (applicationsRes.error) throw applicationsRes.error;
    if (feedbackRes.error) throw feedbackRes.error;
    if (prepTemplatesRes.error && !isMissingInterviewPrepTemplatesSchema(prepTemplatesRes.error)) {
      throw prepTemplatesRes.error;
    }

    const applications = applicationsRes.data ?? [];
    const applicationIds = applications.map((application) => application.id as string);
    const applicationByCandidateJob = new Map<string, string>();
    for (const application of applications) {
      applicationByCandidateJob.set(
        `${application.job_id as string}:${application.candidate_id as string}`,
        application.id as string,
      );
    }

    const assessmentsRes =
      applicationIds.length > 0
        ? await admin
            .from("assessments")
            .select("id, application_id, title, type, status, deadline_at, score, max_score")
            .in("application_id", applicationIds)
        : { data: [], error: null };
    if (assessmentsRes.error) throw assessmentsRes.error;

    const scoreMap = new Map<string, FitScoreRow>();
    for (const score of (scoresRes.data ?? []) as FitScoreRow[]) {
      scoreMap.set(`${score.job_id}:${score.candidate_id}`, score);
    }

    const assessmentsByApplication = new Map<string, AssessmentRow[]>();
    for (const assessment of (assessmentsRes.data ?? []) as AssessmentRow[]) {
      const list = assessmentsByApplication.get(assessment.application_id) ?? [];
      list.push(assessment);
      assessmentsByApplication.set(assessment.application_id, list);
    }

    const feedbackByPipelineCandidate = new Map<string, FeedbackRow[]>();
    for (const feedback of (feedbackRes.data ?? []) as FeedbackRow[]) {
      const list = feedbackByPipelineCandidate.get(feedback.pipeline_candidate_id) ?? [];
      list.push(feedback);
      feedbackByPipelineCandidate.set(feedback.pipeline_candidate_id, list);
    }
    const savedTemplates = (prepTemplatesRes.data ?? []) as PrepTemplateRow[];

    const queue: PrepQueueItem[] = [];
    for (const row of activePipelineRows) {
      const candidate = normalizeCandidate(candidateById.get(row.candidate_id));
      const job = jobMap.get(row.job_id);
      if (!candidate || !job) continue;

      const scheduledAt = row.interview_scheduled_at ?? new Date().toISOString();
      const applicationId = applicationByCandidateJob.get(`${row.job_id}:${row.candidate_id}`);
      const assessments = applicationId ? (assessmentsByApplication.get(applicationId) ?? []) : [];
      const feedback = feedbackByPipelineCandidate.get(row.id) ?? [];
      const fitScore = scoreMap.get(`${row.job_id}:${row.candidate_id}`);
      const pendingAssessments = assessments.filter(
        (assessment) => assessment.status === "pending",
      ).length;
      const submittedAssessments = assessments.filter(
        (assessment) => assessment.status === "submitted",
      ).length;
      const scoredAssessments = assessments.filter(
        (assessment) => assessment.status === "scored",
      ).length;
      const latestFeedback = feedback[0];
      const redFlags = fitScore?.red_flags ?? [];
      const strengths = fitScore?.key_strengths ?? [];
      const greenFlags = fitScore?.green_flags ?? [];

      queue.push({
        pipelineCandidateId: row.id,
        candidateId: row.candidate_id,
        candidateName: candidate.name ?? "Candidate",
        candidateEmail: candidate.email ?? null,
        currentRole: candidate.current_role ?? null,
        location: candidate.location ?? null,
        experienceYears: candidate.experience_years ?? null,
        jobId: row.job_id,
        jobTitle: job.title ?? "Role",
        roleFunction: job.role_function ?? null,
        stageName: stageNameMap.get(row.stage_id ?? "") ?? "Interview",
        scheduledAt,
        overallScore: fitScore?.overall_score ?? null,
        band: fitScore?.band ?? null,
        confidence: fitScore?.confidence ?? null,
        summary: fitScore?.one_line_summary ?? null,
        strengths,
        greenFlags,
        redFlags,
        pendingAssessments,
        submittedAssessments,
        scoredAssessments,
        feedbackCount: feedback.length,
        latestFeedbackAt: latestFeedback?.created_at ?? null,
        latestRecommendation: latestFeedback?.recommendation ?? null,
        prepPriority: prepPriorityFor({
          redFlags,
          pendingAssessments,
          feedbackCount: feedback.length,
          scheduledAt,
        }),
      });
    }
    queue.sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());

    const selectedQueueItem =
      queue.find((item) => item.pipelineCandidateId === requestedPipelineCandidateId) ??
      queue[0] ??
      null;

    let selectedPack: PrepPack | null = null;
    let studioTemplates: PrepPackTemplate[] = [];

    if (selectedQueueItem) {
      const selectedRow = activePipelineRows.find(
        (row) => row.id === selectedQueueItem.pipelineCandidateId,
      );
      const candidate = normalizeCandidate(
        selectedRow ? candidateById.get(selectedRow.candidate_id) : null,
      );
      const applicationId = applicationByCandidateJob.get(
        `${selectedQueueItem.jobId}:${selectedQueueItem.candidateId}`,
      );
      const assessmentRows = applicationId
        ? (assessmentsByApplication.get(applicationId) ?? [])
        : [];
      const feedbackRows =
        feedbackByPipelineCandidate.get(selectedQueueItem.pipelineCandidateId) ?? [];
      const avgRating =
        isInterviewer || feedbackRows.length === 0
          ? null
          : Math.round(
              (feedbackRows.reduce((sum, row) => sum + (row.overall_rating ?? 0), 0) /
                feedbackRows.length) *
                10,
            ) / 10;
      const recommendationBreakdown = isInterviewer
        ? {}
        : feedbackRows.reduce<Record<string, number>>((acc, row) => {
            if (row.recommendation) acc[row.recommendation] = (acc[row.recommendation] ?? 0) + 1;
            return acc;
          }, {});
      // Peers' notes anchor the interviewer — withhold them until they submit.
      const latestNotes = isInterviewer
        ? []
        : feedbackRows
            .map((row) => row.notes?.trim())
            .filter((value): value is string => Boolean(value))
            .slice(0, 3);
      const templates = buildTemplates(selectedQueueItem);
      const selectedJob = jobMap.get(selectedQueueItem.jobId);
      const relevantSavedTemplates = savedTemplates
        .filter((template) =>
          savedTemplateMatches(
            template,
            selectedJob?.organisation_id ?? null,
            selectedQueueItem.roleFunction,
            selectedQueueItem.stageName,
          ),
        )
        .map(toSavedTemplate);
      const combinedTemplates = [...relevantSavedTemplates, ...templates];

      selectedPack = {
        queueItem: selectedQueueItem,
        candidate: {
          id: selectedQueueItem.candidateId,
          name: selectedQueueItem.candidateName,
          email: selectedQueueItem.candidateEmail,
          currentRole: selectedQueueItem.currentRole,
          location: selectedQueueItem.location,
          experienceYears: selectedQueueItem.experienceYears,
          skills: normalizeSkills(candidate?.skills ?? null),
        },
        job: {
          id: selectedQueueItem.jobId,
          title: selectedQueueItem.jobTitle,
          roleFunction: selectedQueueItem.roleFunction,
          compensationMin: jobMap.get(selectedQueueItem.jobId)?.compensation_min ?? null,
          compensationMax: jobMap.get(selectedQueueItem.jobId)?.compensation_max ?? null,
        },
        stage: {
          name: selectedQueueItem.stageName,
          scheduledAt: selectedQueueItem.scheduledAt,
          objective: stageObjective(selectedQueueItem.stageName),
        },
        fitScore: {
          overallScore: selectedQueueItem.overallScore,
          band: selectedQueueItem.band,
          confidence: selectedQueueItem.confidence,
          summary: selectedQueueItem.summary,
          strengths: selectedQueueItem.strengths,
          greenFlags: selectedQueueItem.greenFlags,
          redFlags: selectedQueueItem.redFlags,
        },
        assessments: {
          pendingCount: selectedQueueItem.pendingAssessments,
          submittedCount: selectedQueueItem.submittedAssessments,
          scoredCount: selectedQueueItem.scoredAssessments,
          recent: assessmentRows
            .sort((a, b) => new Date(b.deadline_at).getTime() - new Date(a.deadline_at).getTime())
            .slice(0, 4)
            .map((assessment) => ({
              id: assessment.id,
              title: assessment.title,
              type: assessment.type,
              status: assessment.status,
              deadlineAt: assessment.deadline_at,
              score: assessment.score,
              maxScore: assessment.max_score,
            })),
        },
        feedback: {
          count: feedbackRows.length,
          avgRating,
          latestRecommendation: selectedQueueItem.latestRecommendation,
          latestNotes,
          recommendationBreakdown,
        },
        prepSections: buildPrepSections({
          queueItem: selectedQueueItem,
          pendingAssessments: selectedQueueItem.pendingAssessments,
          submittedAssessments: selectedQueueItem.submittedAssessments,
          latestNotes,
          skills: normalizeSkills(candidate?.skills ?? null),
        }),
        templates: combinedTemplates,
      };

      studioTemplates = combinedTemplates;
    }

    // Strip the AI verdict + peer-feedback signals from what an interviewer sees.
    const sanitizedQueue = isInterviewer
      ? queue.map((item) => ({
          ...item,
          overallScore: null,
          band: null,
          confidence: null,
          summary: null,
          strengths: [],
          greenFlags: [],
          redFlags: [],
          feedbackCount: 0,
          latestFeedbackAt: null,
          latestRecommendation: null,
        }))
      : queue;
    const sanitizedPack: PrepPack | null =
      isInterviewer && selectedPack
        ? {
            ...selectedPack,
            queueItem: {
              ...selectedPack.queueItem,
              overallScore: null,
              band: null,
              confidence: null,
              summary: null,
              strengths: [],
              greenFlags: [],
              redFlags: [],
              feedbackCount: 0,
              latestFeedbackAt: null,
              latestRecommendation: null,
            },
            fitScore: {
              overallScore: null,
              band: null,
              confidence: null,
              summary: null,
              strengths: [],
              greenFlags: [],
              redFlags: [],
            },
            feedback: {
              count: 0,
              avgRating: null,
              latestRecommendation: null,
              latestNotes: [],
              recommendationBreakdown: {},
            },
          }
        : selectedPack;

    return jsonSuccess<InterviewPrepResponse>({
      queue: sanitizedQueue,
      selectedPack: sanitizedPack,
      studioTemplates,
      scope: { roles: scopeRoles },
    });
  } catch (err) {
    return handleApiError(err, "Failed to build interview prep", {
      route: "GET /api/interview-prep",
    });
  }
}
