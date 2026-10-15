/**
 * Copy for the "TigerHire vs other tools" table on product pages.
 * Middle ground: core differentiators + agents, governance, workflow, enterprise — still scannable.
 */
export const PRODUCT_VS_OTHERS_ROWS = [
  { feature: "What you get", other: "Match %", th: "Verdict + reasoning" },
  {
    feature: "JD Intelligence (agents)",
    other: "Paste JD → opaque score",
    th: "Agent drafts role rubrics from JD + 121 templates · 20 industries",
  },
  {
    feature: "Scoring depth",
    other: "Generic skills / keywords",
    th: "492 weighted criteria — tied to the approved rubric",
  },
  {
    feature: "Rubric governance",
    other: "Score without a locked bar",
    th: "Hiring manager approves rubric before FitScore runs",
  },
  {
    feature: "Ideal hire",
    other: "Statistical average",
    th: "HM-approved profile on the same bar",
  },
  { feature: "Market view", other: "Global / generic", th: "Your talent pool" },
  { feature: "Candidate flow", other: "Portal only", th: "WhatsApp + web ATS" },
  {
    feature: "After the score",
    other: "Export or many separate tools",
    th: "Pipeline, scorecards, finance gate, offers — one product",
  },
  {
    feature: "Enterprise identity",
    other: "Password-first typical",
    th: "SSO (e.g. Microsoft Entra) + SCIM-ready provisioning",
  },
] as const;
