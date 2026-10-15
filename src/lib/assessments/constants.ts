export const ASSESSMENT_TYPES = ["written", "take_home", "mcq", "coding", "psychometric"] as const;

export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_BUILDER_TYPES = ["written", "take_home"] as const;
export type AssessmentBuilderType = (typeof ASSESSMENT_BUILDER_TYPES)[number];

export const ASSESSMENT_SCOPES = ["screening", "shortlist", "final"] as const;
export type AssessmentScope = (typeof ASSESSMENT_SCOPES)[number];

export const ASSESSMENT_SCOPE_OPTIONS: Array<{ value: AssessmentScope; label: string }> = [
  { value: "screening", label: "Screening" },
  { value: "shortlist", label: "Shortlist" },
  { value: "final", label: "Final round" },
];

export const ASSESSMENT_TYPE_OPTIONS: Array<{ value: AssessmentBuilderType; label: string }> = [
  { value: "written", label: "Written" },
  { value: "take_home", label: "Take-home" },
];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  written: "Written",
  take_home: "Take-home",
  mcq: "MCQ",
  coding: "Coding",
  psychometric: "Psychometric",
};

export type AssessmentStatus = "pending" | "submitted" | "scored" | "expired";
export const ASSESSMENT_SHARE_CHANNELS = ["email", "whatsapp"] as const;
export type AssessmentShareChannel = (typeof ASSESSMENT_SHARE_CHANNELS)[number];

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  pending: "Pending",
  submitted: "Submitted",
  scored: "Scored",
  expired: "Expired",
};

export const ASSESSMENT_REVIEWER_ROLES = [
  "interviewer",
  "hiring_manager",
  "recruiter",
  "leadership",
  "super_admin",
] as const;

export const TEMPLATE_STUDIO_ROLES = [
  "leadership",
  "super_admin",
  "recruiter",
  "hiring_manager",
  "interviewer",
] as const;

export const ASSESSMENT_EVALUATION_DUE_SOON_HOURS = 48;

/** Strip the Built‑in catalogue prefix when saving/installing packs to the organisation. */
export function builtInPackDisplayName(label: string): string {
  const parts = label.split(" · ");
  return parts.length > 1 ? parts.slice(1).join(" · ").trim() : label.trim();
}

/** Built‑in TigerHire packs — HTML renders in the instruction editor; validated like org templates at save boundaries. */
export const ASSESSMENT_TEMPLATE_LIBRARY: Record<
  AssessmentBuilderType,
  Array<{ key: string; label: string; content: string }>
> = {
  written: [
    {
      key: "written_screening_star",
      label: "Built‑in · Screening — STAR short answers (~25 min)",
      content: `
<h2>Instructions</h2>
<p>Use clear, concise prose. Aim for roughly <strong>150–250 words total</strong> across all answers unless your recruiter sets a different limit.</p>
<h3>Questions</h3>
<ol>
<li><strong>Motivation</strong> — Why this role and this company now? What are you optimizing for over the next 12–24 months?</li>
<li><strong>Relevant experience (STAR)</strong> — Describe one situation relevant to this role where you:<ul>
<li>Set or clarified the goal,</li>
<li>Took concrete actions,</li>
<li>Measured or judged the outcome.</li></ul></li>
<li><strong>Gaps &amp; learning</strong> — What skill or domain will you need to ramp fastest, and how will you close it in the first 90 days?</li>
</ol>
<h3>Submit</h3>
<p>Paste answers in order in your submission box, or attach a single PDF if that is easier for formatting.</p>`.trim(),
    },
    {
      key: "written_screening_situational",
      label: "Built‑in · Screening — Situational judgment (timed written)",
      content: `
<h2>Scenario</h2>
<p>A key stakeholder emails Friday 4pm insisting a deliverable promised for Monday morning must slip by one week due to conflicting priorities — but the candidate interview panel is already scheduled and collateral is incomplete.</p>
<h3>Task</h3>
<p>In <strong>under 400 words</strong>, describe what you would do in the next 48 hours:</p>
<ul>
<li>How you clarify facts vs assumptions,</li>
<li>Who you involve and in what sequence,</li>
<li>The trade-offs you propose,</li>
<li>How you protect both relationship and delivery risk.</li>
</ul>
<p>We grade for judgment, pacing, and communication — not perfection.</p>`.trim(),
    },
    {
      key: "written_shortlist_prioritisation",
      label: "Built‑in · Shortlist — Prioritisation memo",
      content: `
<h2>Prompt</h2>
<p>You are joining with <strong>tight capacity</strong> and three plausible initiatives competing for attention this quarter:</p>
<ul>
<li><strong>A</strong> — Fix reliability / quality issues affecting existing users.</li>
<li><strong>B</strong> — Launch an experiment aimed at funnel growth.</li>
<li><strong>C</strong> — Pay down foundational tech or process debt.</li>
</ul>
<h3>Deliverable</h3>
<p>Write a <strong>one-page prioritisation memo</strong> (bullet outline is fine) that includes:</p>
<ol>
<li>Ranking (1–3) with a single headline rationale each,</li>
<li>Assumptions you would validate first,</li>
<li>What you would deliberately <em>not</em> do this quarter,</li>
<li>Success signals you would monitor after 30 and 90 days.</li>
</ol>
<p>Optional: append a lightweight RACI snippet for Initiative #1.</p>`.trim(),
    },
    {
      key: "written_shortlist_stakeholder_comms",
      label: "Built‑in · Shortlist — Candidate + hiring update drafts",
      content: `
<h2>Context</h2>
<p>You are coordinating a multi-stage process. Hiring manager pressure is rising; candidates expect transparency.</p>
<h3>Part A — Candidate-facing email (~120–180 words)</h3>
<p>Draft an update explaining a modest schedule slip (without over-sharing internals), reaffirming next steps, timelines, and a single clear call to action.</p>
<h3>Part B — Internal hiring-team note (~120–180 words)</h3>
<p>Draft an internal note summarising blocker, decision requested, risks, and a recommended timeline — suitable for Slack or email leadership.</p>
<h3>Rubric cues</h3>
<ul>
<li>Tone calibrated to audience,</li>
<li>Concrete dates or ranges where possible,</li>
<li>No blame; solutions-first.</li>
</ul>`.trim(),
    },
    {
      key: "written_final_exec_summary",
      label: "Built‑in · Final — Exec summary &amp; recommendation",
      content: `
<h2>Brief</h2>
<p>Assume you have synthesised stakeholder interviews plus rough metrics supplied by the recruiter. Leadership needs a crisp decision memo.</p>
<h3>Deliverable — max ~600 words</h3>
<ol>
<li><strong>Situation</strong> — 2–3 sentences on problem and urgency.</li>
<li><strong>Options</strong> — At least two viable paths with pros/cons.</li>
<li><strong>Recommendation</strong> — One preferred path plus explicit risks.</li>
<li><strong>Ask</strong> — Resources, approvals, or sequencing leadership must green-light.</li>
</ol>
<p>Append a bullet <strong>Risks / mitigations</strong> subsection (≤5 bullets).</p>`.trim(),
    },
    {
      key: "written_shortlist_gtm_slice",
      label: "Built‑in · Shortlist — GTM / growth slice planning",
      content: `
<h2>Scenario</h2>
<p>A new tier of the product is launching in eight weeks into a geography you partly own — budget is capped; brand is unknown.</p>
<h3>What to submit — outline format OK</h3>
<ul>
<li><strong>ICP hypothesis</strong> — Who buys first and why,</li>
<li><strong>Message &amp; proof</strong> — Headline narrative + credibility assets you would source,</li>
<li><strong>Channel mix</strong> — Pick 2–3 channels only; defend trade-offs,</li>
<li><strong>30-day instrumentation</strong> — Events or metrics you insist on,</li>
<li><strong>Risks &amp; kill criteria</strong> — What would make you pivot.</li>
</ul>
<p>Total length ≈450–650 words equivalent.</p>`.trim(),
    },
  ],
  take_home: [
    {
      key: "takehome_screening_timeboxed_plan",
      label: "Built‑in · Screening — Time-boxed plan + assumptions (~90 min)",
      content: `
<h2>Time box</h2>
<p>You have <strong>90 minutes active work</strong> (excluding reading this brief). Honour the constraint — partial depth beats fake completeness.</p>
<h3>Instructions</h3>
<ol>
<li>Restate the outcome in one sentence.</li>
<li>List explicit <strong>assumptions</strong> and unknowns ranked by blast radius.</li>
<li>Propose an execution plan broken into milestones (table or bullets).</li>
<li>Note dependencies, approvals, or data you cannot proceed without.</li>
<li>List top 5 risks each with mitigation + earliest warning signal.</li>
</ol>
<h3>Submit</h3>
<p>Prefer a concise doc (Markdown or PDF). If spreadsheets help, summarise takeaways inline and link the sheet under <strong>Attachment links</strong>.</p>`.trim(),
    },
    {
      key: "takehome_shortlist_product_critique",
      label: "Built‑in · Shortlist — Product / experience critique",
      content: `
<h2>Objective</h2>
<p>Evaluate a publicly available workflow (either our product sandbox or another product designated by recruiting) as if you owned activation for new users.</p>
<h3>Deliverable (~3–5 pages or equivalent Markdown)</h3>
<ul>
<li><strong>JTBD recap</strong> — Who, job, substitutes.</li>
<li><strong>Journey teardown</strong> — Friction logs with severity.</li>
<li><strong>3 improvements</strong> — Prioritised with expected impact hypothesis.</li>
<li><strong>Experiment plan</strong> — One falsifiable test with metric + duration.</li>
<li><strong>Open questions</strong> — Evidence you still need.</li>
</ul>
<p>Use screenshots sparingly — narrative clarity matters more.</p>`.trim(),
    },
    {
      key: "takehome_shortlist_data_story",
      label: "Built‑in · Shortlist — Data-backed narrative (bring your toolkit)",
      content: `
<h2>You will receive</h2>
<ul>
<li>A dataset or workbook link,</li>
<li>One stakeholder question,</li>
<li>A hard deadline — typically within five working days unless specified otherwise.</li>
</ul>
<h3>Submit</h3>
<ol>
<li><strong>Notebook / sheet link</strong> — Reproducible steps so we can sanity-check aggregates.</li>
<li><strong>Executive summary — max 350 words:</strong><ul>
<li>Insight headline,</li>
<li>Evidence quality &amp; caveats,</li>
<li>Recommendation + next analytic cut.</li>
</ul></li>
<li>Optional: one chart image if it carries the story.</li>
</ol>
<p>Clearly flag any merges, filters, or imputations you applied.</p>`.trim(),
    },
    {
      key: "takehome_shortlist_technical_design_lite",
      label: "Built‑in · Shortlist — Architecture / integration outline (~3 h)",
      content: `
<h2>Prompt</h2>
<p>You are extending an existing SaaS-style system with a new integration (webhooks vs polling, idempotency, retries, auditing).</p>
<h3>Artifacts</h3>
<ul>
<li><strong>High-level diagram</strong> — Image or Mermaid pasted into doc.</li>
<li><strong>Component responsibilities</strong> — Table (component, inbound/outbound interfaces, SLA).</li>
<li><strong>API sketch</strong> — Key endpoints with example payloads (&lt;=2 pages).</li>
<li><strong>Failure modes</strong> — At least 8 bullets mapping failure → mitigation.</li>
<li><strong>Operational checklist</strong> — Logging, alerting, rollout.</li>
</ul>
<h3>Note</h3>
<p>Favour crisp trade-offs over buzzwords — we explicitly review how you prune scope.</p>`.trim(),
    },
    {
      key: "takehome_final_capstone_reflect",
      label: "Built‑in · Final — Capstone + retrospective",
      content: `
<h2>Capstone (~1–2 days unless recruiter specifies shorter)</h2>
<p>You will ship a narrowly scoped artefact tackling a realistic problem tied to our domain.</p>
<h3>Mandatory submissions</h3>
<ol>
<li><strong>README / memo</strong> — Problem framing, stakeholders, acceptance criteria,</li>
<li><strong>The artefact</strong> — Code, spreadsheet model, slides, prototype — whatever matches the brief,</li>
<li><strong>Short demo script</strong> — 10-minute spoken walk-through outline,</li>
<li><strong>Retrospective (≤500 words)</strong> — Three things you’d redo, assumptions that changed, scalability limits.</li>
</ol>
<p>Prefer public GitHub/GitLab URLs or zipped attachment links pasted with stable access.</p>`.trim(),
    },
    {
      key: "takehome_screening_research_brief",
      label: "Built‑in · Screening — Desk research bundle (~2 h)",
      content: `
<h2>Mission</h2>
<p>Produce a desk-research briefing on <strong>a market or competitor set</strong> the recruiter assigns.</p>
<h3>Required sections</h3>
<ul>
<li><strong>TAM / segmentation snapshot</strong> — Transparent sources,</li>
<li><strong>Competitive matrix</strong> — 6–10 attributes you defend,</li>
<li><strong>Strategic hypotheses</strong> — 3 testable assertions,</li>
<li><strong>Follow-up diligence</strong> — Interviews/experiments to run next,</li>
<li><strong>Bibliography</strong> — Link every non-obvious claim.</li>
</ul>
<h3>Format</h3>
<p>Bullet-dense briefing (≈750–1100 words) + optional appendix table.</p>
<p>List source URLs separately under Attachment links when helpful.</p>`.trim(),
    },
  ],
};

export function getAssessmentTypeLabel(type: AssessmentType): string {
  return ASSESSMENT_TYPE_LABELS[type];
}

export function getAssessmentStatusLabel(status: AssessmentStatus): string {
  return ASSESSMENT_STATUS_LABELS[status];
}
