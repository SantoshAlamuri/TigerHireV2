import { expect, test } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { gotoRoute } from "./helpers/navigation";

const PREP_QUEUE_ITEM = {
  pipelineCandidateId: "pc-1",
  candidateId: "candidate-1",
  candidateName: "Asha Singh",
  candidateEmail: "asha@example.com",
  currentRole: "Senior Recruiter",
  location: "Bengaluru",
  experienceYears: 6,
  jobId: "job-1",
  jobTitle: "Founding Recruiter",
  roleFunction: "Recruiting",
  stageName: "Hiring Manager Round",
  scheduledAt: "2026-04-20T09:00:00.000Z",
  overallScore: 87,
  band: "Strong",
  confidence: "High",
  summary: "Strong sourcing depth with good ownership examples.",
  strengths: ["Stakeholder management", "Sourcing depth"],
  greenFlags: ["Clear ownership"],
  redFlags: ["Needs deeper data rigor validation"],
  pendingAssessments: 0,
  submittedAssessments: 1,
  scoredAssessments: 1,
  feedbackCount: 2,
  latestFeedbackAt: "2026-04-18T11:00:00.000Z",
  latestRecommendation: "hire",
  prepPriority: "high",
} as const;

const PREP_SELECTED_PACK = {
  queueItem: PREP_QUEUE_ITEM,
  candidate: {
    id: "candidate-1",
    name: "Asha Singh",
    email: "asha@example.com",
    currentRole: "Senior Recruiter",
    location: "Bengaluru",
    experienceYears: 6,
    skills: ["Hiring", "Sourcing", "Stakeholder management"],
  },
  job: {
    id: "job-1",
    title: "Founding Recruiter",
    roleFunction: "Recruiting",
    compensationMin: 1500000,
    compensationMax: 2200000,
  },
  stage: {
    name: "Hiring Manager Round",
    scheduledAt: "2026-04-20T09:00:00.000Z",
    objective: "Pressure-test ownership, judgment, and role-specific execution depth.",
  },
  fitScore: {
    overallScore: 87,
    band: "Strong",
    confidence: "High",
    summary: "Strong sourcing depth with good ownership examples.",
    strengths: ["Stakeholder management", "Sourcing depth"],
    greenFlags: ["Clear ownership"],
    redFlags: ["Needs deeper data rigor validation"],
  },
  assessments: {
    pendingCount: 0,
    submittedCount: 1,
    scoredCount: 1,
    recent: [
      {
        id: "assessment-1",
        title: "Recruiting case study",
        type: "take_home",
        status: "submitted",
        deadlineAt: "2026-04-19T10:00:00.000Z",
        score: 82,
        maxScore: 100,
      },
    ],
  },
  feedback: {
    count: 2,
    avgRating: 4.5,
    latestRecommendation: "hire",
    latestNotes: ["Good ownership, probe analytics depth."],
    recommendationBreakdown: { hire: 2 },
  },
  prepSections: [
    {
      title: "Round objective",
      points: ["Pressure-test ownership, judgment, and role-specific execution depth."],
    },
    {
      title: "What still needs proof",
      points: ["Follow up on: Needs deeper data rigor validation"],
    },
  ],
  templates: [
    {
      id: "saved-template-1",
      key: "saved-template-1",
      title: "Saved hiring manager round",
      whenToUse: "Use for HM rounds on recruiting leadership roles.",
      objective: "Validate execution depth and stakeholder judgment.",
      questionTracks: ["Ask for a complex stakeholder alignment example."],
      rubric: ["Ownership", "Judgment"],
      roleFunction: "Recruiting",
      stageName: "Hiring Manager Round",
      source: "saved",
    },
    {
      key: "role-depth",
      title: "Role depth track",
      whenToUse: "Best when you need to confirm execution quality in the target function.",
      objective: "Verify the candidate can operate effectively in Recruiting.",
      questionTracks: [
        "Ask the candidate to walk through a recent project most relevant to Recruiting.",
      ],
      rubric: ["Role depth"],
      roleFunction: "Recruiting",
      stageName: "Hiring Manager Round",
      source: "suggested",
    },
  ],
} as const;

const SAVED_PREP_TEMPLATE = {
  id: "saved-template-1",
  key: "saved-template-1",
  title: "Saved hiring manager round",
  whenToUse: "Use for HM rounds on recruiting leadership roles.",
  objective: "Validate execution depth and stakeholder judgment.",
  questionTracks: ["Ask for a complex stakeholder alignment example."],
  rubric: ["Ownership", "Judgment"],
  roleFunction: "Recruiting",
  stageName: "Hiring Manager Round",
  source: "saved",
} as const;

async function mockInterviewPrep(
  page: import("@playwright/test").Page,
  options?: { selectedPack?: boolean },
) {
  await page.route("**/api/interview-prep**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        queue: [PREP_QUEUE_ITEM],
        selectedPack: options?.selectedPack === false ? null : PREP_SELECTED_PACK,
        studioTemplates: PREP_SELECTED_PACK.templates,
      }),
    });
  });

  await page.route("**/api/interview-prep/templates**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          templates: [SAVED_PREP_TEMPLATE],
          canManageTemplates: true,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        template: { id: "saved-template-1" },
      }),
    });
  });
}

async function loginAsRecruiter(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "rajiv.menon@finstack.in",
    buttonName: /recruiter/i,
    expectedPath: /\/recruit/,
  });
}

async function loginAsCompanyAdmin(page: import("@playwright/test").Page) {
  await loginWithFallback(page, {
    email: "nidhi.gupta@finstack.in",
    buttonName: /company admin/i,
    expectedPath: /\/company/,
  });
}

test.describe("Assessments and prep risk coverage", () => {
  test("assessments workspace keeps supported assessment scope honest", async ({ page }) => {
    await loginAsRecruiter(page);

    await page.route("**/api/assessments**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          assessments: [
            {
              id: "assessment-1",
              application_id: "application-1",
              title: "Case response",
              type: "written",
              status: "submitted",
              deadline_at: "2026-04-15T10:00:00.000Z",
              score: null,
              max_score: null,
              pass_threshold_pct: 60,
              instructions: "Review the brief and respond with your recommendation.",
            },
          ],
        }),
      });
    });

    await page.route("**/api/applications**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          applications: [
            {
              id: "application-1",
              jobs: { title: "Founding Recruiter" },
              candidates: { name: "Asha Singh" },
            },
          ],
        }),
      });
    });

    await page.route("**/api/organisations/members**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          members: [
            {
              id: "reviewer-1",
              full_name: "Kavita Rao",
              role: "hiring_manager",
            },
          ],
        }),
      });
    });

    await page.route("**/api/assessment-templates**", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            templates: [],
            canManageTemplates: true,
          }),
        });
        return;
      }
      await route.continue();
    });

    await gotoRoute(page, "/recruit/assessments");

    await expect(page.getByRole("heading", { name: "Assessments", exact: true })).toBeVisible();
    await expect(page.getByText("Create center", { exact: true })).toBeVisible();
    await expect(page.getByText("Evaluation inbox", { exact: true })).toBeVisible();
    await expect(
      page.getByText(/Live builder support today is focused on written and take-home workflows/i),
    ).toBeVisible();

    const supportedTypeOptions = page.locator("option").filter({ hasText: /Written|Take-home/ });
    await expect(supportedTypeOptions).toHaveCount(4);
    await expect(page.locator("option", { hasText: /^Coding$/i })).toHaveCount(0);
    await expect(page.locator("option", { hasText: /^MCQ$/i })).toHaveCount(0);
    await expect(page.locator("option", { hasText: /Psychometric/i })).toHaveCount(0);
  });

  test("interview prep renders candidate-specific prep context from composed backend", async ({
    page,
  }) => {
    await loginAsRecruiter(page);

    await mockInterviewPrep(page);

    await gotoRoute(page, "/recruit/interview-prep?pipelineCandidateId=pc-1");

    await expect(page.getByRole("heading", { name: "Interview Prep" })).toBeVisible();
    await expect(page.getByText("Prep context")).toBeVisible();
    await expect(page.getByText("Asha Singh - Founding Recruiter")).toBeVisible();
    await expect(page.getByText("Signal snapshot")).toBeVisible();
    await expect(page.getByText("Good ownership, probe analytics depth.")).toBeVisible();
    await expect(page.getByText("Saved studio")).toBeVisible();
    await expect(page.getByText("Saved hiring manager round").first()).toBeVisible();
    await expect(page.getByText("saved").first()).toBeVisible();
    await expect(page.getByText("AI assistance now available here")).toHaveCount(0);
  });

  test("recruiter selected prep pack handoff stays role-specific", async ({ page }) => {
    await loginAsRecruiter(page);
    await mockInterviewPrep(page);

    await gotoRoute(page, "/recruit/interview-prep?pipelineCandidateId=pc-1");

    await expect(
      page.getByRole("link", { name: "Open tomorrow plan in pipeline" }),
    ).toHaveAttribute("href", "/recruit/pipeline?focus=tomorrow-plan");
    await expect(page.getByRole("link", { name: "Open assessment review queue" })).toHaveAttribute(
      "href",
      "/recruit/assessments?focus=submitted",
    );
    await expect(page.getByRole("link", { name: "Open feedback workspace" })).toHaveAttribute(
      "href",
      "/recruit/jobs/job-1/feedback",
    );
    await expect(page.getByRole("link", { name: "Open recruiter dashboard" })).toHaveAttribute(
      "href",
      "/recruit",
    );
  });

  test("company selected prep pack handoff stays role-specific", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await mockInterviewPrep(page);

    await gotoRoute(page, "/company/interview-prep?pipelineCandidateId=pc-1");

    await expect(
      page.getByRole("link", { name: "Open tomorrow plan in pipeline" }),
    ).toHaveAttribute("href", "/company/my-pipeline?focus=tomorrow-plan");
    await expect(page.getByRole("link", { name: "Open assessment review queue" })).toHaveAttribute(
      "href",
      "/company/assessments?focus=submitted",
    );
    await expect(page.getByRole("link", { name: "Open role workspace" })).toHaveAttribute(
      "href",
      "/company/jobs/job-1",
    );
    await expect(page.getByRole("link", { name: "Open interview schedule" })).toHaveAttribute(
      "href",
      "/company/interviews",
    );
  });

  test("company empty prep handoff avoids misleading fallback cards", async ({ page }) => {
    await loginAsCompanyAdmin(page);
    await mockInterviewPrep(page, { selectedPack: false });

    await gotoRoute(page, "/company/interview-prep");

    await expect(
      page.getByRole("link", { name: "Open tomorrow plan in pipeline" }),
    ).toHaveAttribute("href", "/company/my-pipeline?focus=tomorrow-plan");
    await expect(page.getByRole("link", { name: "Open assessment review queue" })).toHaveAttribute(
      "href",
      "/company/assessments?focus=submitted",
    );
    await expect(page.getByRole("link", { name: "Open interview schedule" })).toHaveAttribute(
      "href",
      "/company/interviews",
    );
    await expect(page.getByRole("link", { name: "Open role workspace" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open job/pipeline context" })).toHaveCount(0);
  });

  test("interviewer queue lists assignments without interview prep links", async ({ page }) => {
    await loginAsCompanyAdmin(page);

    await page.route("**/api/interviewer/interviews**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          interviews: [
            {
              pipelineCandidateId: "pc-77",
              candidateName: "Devika Rao",
              candidateEmail: "devika@example.com",
              jobTitle: "Talent Partner",
              stageName: "Interviewer Round",
              scheduledAt: "2026-04-21T08:30:00.000Z",
              feedbackSubmitted: false,
            },
          ],
        }),
      });
    });

    await gotoRoute(page, "/company/interviews");

    await expect(page.getByRole("heading", { name: "Interviewer Queue" })).toBeVisible();
    await expect(page.getByText("Devika Rao")).toBeVisible();
    await expect(page.locator('a[href*="/company/interview-prep"]')).toHaveCount(0);
  });
});
