import type { WhatsAppScript } from "../../types";

export const productWhatsAppScript: WhatsAppScript = {
  role_category: "product",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name}, thanks for applying to {role_title} at {company_name}. I'm TigerHire's AI assistant and I have a few quick product screening questions.",
  consent_question: "Reply YES to start, or SKIP to move directly to recruiter review.",
  questions: [
    {
      id: "notice_period_days",
      text: "What is your current notice period in days?",
      expected_format: "number",
      required: true,
    },
    {
      id: "current_ctc_lakhs",
      text: "Current CTC in LPA?",
      expected_format: "number",
      required: true,
    },
    {
      id: "expected_ctc_lakhs",
      text: "Expected CTC in LPA?",
      expected_format: "number",
      required: true,
    },
    {
      id: "product_scope",
      text: "What type of product area do you currently own end-to-end?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "impact_metric",
      text: "Share one feature you shipped and the KPI movement it drove.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "tradeoff_example",
      text: "Describe a tradeoff decision you made between speed, scope, and quality.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "location_preference",
      text: "Are you open to 1) onsite Bangalore 2) hybrid 3) remote-only?",
      expected_format: "enum",
      enum_values: ["1", "2", "3"],
      required: false,
    },
  ],
  closing:
    "Great, thank you {candidate_name}. Your responses are now with the hiring team and the recruiter will follow up soon.",
};
