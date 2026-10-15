import type { DemoRubric } from "@/lib/agents/demo-rubric";
import type { DemoScoredCandidate } from "@/lib/agents/demo-score";

/** Prefilled JD for the homepage live demo (user-editable before running). */
export const SAMPLE_JD = `Technical Scrum Master — ACME Corp

We need a Scrum Master who has scaled agile delivery across multiple cross-functional teams. Must have CSM or PMI-ACP. Hands-on CI/CD exposure required; Docker/Kubernetes strongly preferred. Will own delivery governance, risk management and stakeholder communication for a 40-person engineering org.

Bangalore · Hybrid · 8–12 yrs`;

/**
 * Canned fallback shown when the live endpoints fail or are rate-limited.
 * Always rendered with a visible "sample output" badge — never passed off as
 * a live result.
 */
export const FALLBACK_RUBRIC: DemoRubric = {
  roleTitle: "Technical Scrum Master",
  criteria: [
    { name: "Delivery governance", weight: 25 },
    { name: "Technical acumen (CI/CD, containers)", weight: 20 },
    { name: "Risk management", weight: 20 },
    { name: "Stakeholder communication", weight: 15 },
    { name: "Team scaling experience", weight: 10 },
    { name: "Certifications (CSM / PMI-ACP)", weight: 10 },
  ],
};

export const FALLBACK_SCORED: DemoScoredCandidate[] = [
  {
    id: "sample-1",
    name: "Sample Candidate 1",
    initials: "C1",
    headline: "Technical Scrum Master · 9 yrs",
    result: {
      fitScore: 78,
      verdict: "STRONG_HIRE",
      idealMatch: 62,
      confidence: 0.87,
      dimensions: [
        { name: "Delivery governance", score: 85 },
        { name: "Technical acumen (CI/CD, containers)", score: 58 },
        { name: "Risk management", score: 78 },
        { name: "Stakeholder communication", score: 91 },
        { name: "Team scaling experience", score: 88 },
        { name: "Certifications (CSM / PMI-ACP)", score: 95 },
      ],
      flags: [
        { type: "ok", text: "Led 8 Scrum teams, cross-functional delivery" },
        { type: "warn", text: "CI/CD hands-on: 1 year (target 2+)" },
        { type: "miss", text: "Docker/K8s not detected (required)" },
      ],
      rationale:
        "Strong delivery governance (85) and stakeholder comms (91). Ideal match 62% due to the Docker/K8s gap, but scale and certification evidence offset it. Worth a screening call.",
    },
  },
  {
    id: "sample-4",
    name: "Sample Candidate 4",
    initials: "C4",
    headline: "Product Manager · 7 yrs",
    result: {
      fitScore: 54,
      verdict: "SCREEN",
      idealMatch: 41,
      confidence: 0.78,
      dimensions: [
        { name: "Delivery governance", score: 62 },
        { name: "Technical acumen (CI/CD, containers)", score: 20 },
        { name: "Risk management", score: 55 },
        { name: "Stakeholder communication", score: 90 },
        { name: "Team scaling experience", score: 48 },
        { name: "Certifications (CSM / PMI-ACP)", score: 60 },
      ],
      flags: [
        { type: "ok", text: "Board-level stakeholder communication" },
        { type: "warn", text: "Sprint ceremonies run, but as PM not SM" },
        { type: "miss", text: "No hands-on CI/CD evidence" },
      ],
      rationale:
        "Excellent communicator with CSPO, but the role asks for delivery ownership and technical depth the CV doesn't evidence.",
    },
  },
  {
    id: "sample-2",
    name: "Sample Candidate 2",
    initials: "C2",
    headline: "Backend Engineer · 6 yrs",
    result: {
      fitScore: 47,
      verdict: "SCREEN",
      idealMatch: 38,
      confidence: 0.81,
      dimensions: [
        { name: "Delivery governance", score: 25 },
        { name: "Technical acumen (CI/CD, containers)", score: 92 },
        { name: "Risk management", score: 40 },
        { name: "Stakeholder communication", score: 45 },
        { name: "Team scaling experience", score: 30 },
        { name: "Certifications (CSM / PMI-ACP)", score: 5 },
      ],
      flags: [
        { type: "ok", text: "3 yrs Kubernetes/Docker in production" },
        { type: "miss", text: "No Scrum Master or agile-lead experience" },
      ],
      rationale:
        "Deep technical acumen the role wants, but no evidence of running agile delivery or governance. Wrong seat, right building.",
    },
  },
  {
    id: "sample-5",
    name: "Sample Candidate 5",
    initials: "C5",
    headline: "Full-stack Developer · 3 yrs",
    result: {
      fitScore: 39,
      verdict: "PASS",
      idealMatch: 30,
      confidence: 0.74,
      dimensions: [
        { name: "Delivery governance", score: 20 },
        { name: "Technical acumen (CI/CD, containers)", score: 70 },
        { name: "Risk management", score: 25 },
        { name: "Stakeholder communication", score: 40 },
        { name: "Team scaling experience", score: 15 },
        { name: "Certifications (CSM / PMI-ACP)", score: 5 },
      ],
      flags: [
        { type: "ok", text: "Set up CI with test gates and preview deploys" },
        { type: "miss", text: "Experience below the 8-12 yr range" },
      ],
      rationale:
        "Capable engineer, but 3 years' experience and no delivery-leadership evidence put this outside the approved bar.",
    },
  },
  {
    id: "sample-3",
    name: "Sample Candidate 3",
    initials: "C3",
    headline: "Data Analyst · 4 yrs",
    result: {
      fitScore: 22,
      verdict: "PASS",
      idealMatch: 15,
      confidence: 0.85,
      dimensions: [
        { name: "Delivery governance", score: 10 },
        { name: "Technical acumen (CI/CD, containers)", score: 20 },
        { name: "Risk management", score: 15 },
        { name: "Stakeholder communication", score: 55 },
        { name: "Team scaling experience", score: 5 },
        { name: "Certifications (CSM / PMI-ACP)", score: 5 },
      ],
      flags: [
        { type: "ok", text: "Clear exec reporting and dashboard work" },
        { type: "miss", text: "No agile delivery experience of any kind" },
      ],
      rationale:
        "Strong analyst profile, but the CV has no evidence for any rubric criterion beyond communication. Honest PASS.",
    },
  },
];
