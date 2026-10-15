import type { WhatsAppScript } from "../../types";

export const backendWhatsAppScript: WhatsAppScript = {
  role_category: "backend",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name}, thanks for applying to {role_title} at {company_name}. I'm TigerHire's AI screening assistant and this takes about 3-4 minutes.",
  consent_question: "Reply YES to continue, or SKIP to move directly to recruiter review.",
  questions: [
    {
      id: "notice_period_days",
      text: "What is your current notice period in days?",
      expected_format: "number",
      required: true,
    },
    {
      id: "current_ctc_lakhs",
      text: "What is your current CTC in LPA (number only)?",
      expected_format: "number",
      required: true,
    },
    {
      id: "expected_ctc_lakhs",
      text: "What is your expected CTC in LPA?",
      expected_format: "number",
      required: true,
    },
    {
      id: "location_preference",
      text: "Are you open to 1) onsite Bangalore 2) hybrid 3) remote-only? Reply 1, 2, or 3.",
      expected_format: "enum",
      enum_values: ["1", "2", "3"],
      required: true,
    },
    {
      id: "primary_stack",
      text: "What is your primary backend stack?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "system_design_example",
      text: "In 2-3 sentences, describe one backend system you designed and shipped end-to-end.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "reason_for_change",
      text: "What is driving your job search right now?",
      expected_format: "free_text",
      required: false,
    },
  ],
  closing:
    "Thanks {candidate_name}. Your responses are now with the recruiter, and they will typically update you within 48 hours.",
};
