import type { WhatsAppScript } from "../../types";

export const devopsWhatsAppScript: WhatsAppScript = {
  role_category: "devops",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name}, thanks for applying to {role_title} at {company_name}. I'm TigerHire's AI assistant and this is a short DevOps screening.",
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
      id: "infra_stack",
      text: "What cloud/platform stack do you use most (AWS/Azure/GCP, Kubernetes, Terraform, etc.)?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "incident_example",
      text: "Describe a production incident you handled and what you changed afterward.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "delivery_reliability",
      text: "How do you balance release velocity with reliability and security?",
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
    "Thanks {candidate_name}. The recruiter now has your responses and will share next steps shortly.",
};
