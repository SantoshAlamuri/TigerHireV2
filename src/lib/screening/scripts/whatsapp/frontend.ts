import type { WhatsAppScript } from "../../types";

export const frontendWhatsAppScript: WhatsAppScript = {
  role_category: "frontend",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name}, thanks for applying to {role_title} at {company_name}. I'm TigerHire's AI assistant and will ask 6 quick screening questions.",
  consent_question: "Reply YES to proceed, or SKIP to move straight to recruiter review.",
  questions: [
    {
      id: "notice_period_days",
      text: "What is your current notice period in days?",
      expected_format: "number",
      required: true,
    },
    {
      id: "current_ctc_lakhs",
      text: "Current CTC in LPA (number only)?",
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
      id: "frontend_stack",
      text: "What is your current frontend stack (frameworks, state management, testing)?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "performance_example",
      text: "Share one example where you improved frontend performance and how you measured impact.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "design_collaboration",
      text: "How do you collaborate with design/product when requirements are ambiguous?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "location_preference",
      text: "Are you open to 1) onsite Bangalore 2) hybrid 3) remote-only? Reply 1, 2, or 3.",
      expected_format: "enum",
      enum_values: ["1", "2", "3"],
      required: false,
    },
  ],
  closing:
    "Perfect, thanks {candidate_name}. Your responses are shared with the recruiter and they will update you on next steps soon.",
};
