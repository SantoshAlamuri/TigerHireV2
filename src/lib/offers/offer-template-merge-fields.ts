import type { OfferTemplateVariables } from "@/lib/offers/interpolate-offer-template";

/**
 * Merge tokens available in offer letter templates (replaced when the PDF is generated).
 * Recruiters insert these into the rich editor; values come from the offer / org at send time.
 */
export type OfferTemplateMergeField = {
  /** Placeholder as typed in the template, e.g. `{{candidate_name}}` */
  token: string;
  /** Internal key (without braces) — matches `OfferTemplateVariables` */
  key: keyof OfferTemplateVariables;
  label: string;
  description: string;
  /** Shown in the reference table as a realistic example after merge */
  exampleFilled: string;
};

export const OFFER_TEMPLATE_MERGE_FIELDS: OfferTemplateMergeField[] = [
  {
    token: "{{company_name}}",
    key: "company_name",
    label: "Company name",
    description: "Your organisation display name.",
    exampleFilled: "Acme Technologies Pvt Ltd",
  },
  {
    token: "{{candidate_name}}",
    key: "candidate_name",
    label: "Candidate name",
    description: "From the candidate profile on the application.",
    exampleFilled: "Priya Sharma",
  },
  {
    token: "{{role_title}}",
    key: "role_title",
    label: "Role title",
    description: "The role line on the offer.",
    exampleFilled: "Senior Software Engineer",
  },
  {
    token: "{{start_date}}",
    key: "start_date",
    label: "Start date",
    description: "Offer start date (ISO or as entered on the offer).",
    exampleFilled: "2026-06-01",
  },
  {
    token: "{{compensation}}",
    key: "compensation",
    label: "Compensation (JSON)",
    description: "Structured compensation object as formatted text.",
    exampleFilled: '{ "ctc": 2400000, "currency": "INR" }',
  },
  {
    token: "{{compensation_breakdown}}",
    key: "compensation_breakdown",
    label: "Compensation breakdown",
    description: "Multi-line breakdown from the in-app CTC calculator when used.",
    exampleFilled: "Base: 18 LPA\nVariable: 4 LPA\nBenefits: Medical + PF",
  },
  {
    token: "{{ctc_lpa}}",
    key: "ctc_lpa",
    label: "CTC (LPA line)",
    description: "Human-readable CTC in LPA when applicable.",
    exampleFilled: "24 LPA (approx. INR 24,00,000 p.a.)",
  },
  {
    token: "{{notes}}",
    key: "notes",
    label: "Offer notes",
    description: "Internal notes on the offer, or “(none)”.",
    exampleFilled: "Relocation support discussed verbally.",
  },
  {
    token: "{{generated_date}}",
    key: "generated_date",
    label: "Generated date",
    description: "UTC date when the PDF is generated.",
    exampleFilled: "2026-04-16",
  },
];
