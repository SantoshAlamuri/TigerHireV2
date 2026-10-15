import type { WhatsAppScript } from "../../types";

export const dataMlWhatsAppScript: WhatsAppScript = {
  role_category: "data_ml",
  version: "1.0.0",
  greeting:
    "Hi {candidate_name}, thanks for your application to {role_title} at {company_name}. I'm TigerHire's AI assistant and this screening takes around 4 minutes.",
  consent_question: "Reply YES to continue, or SKIP to go directly to the recruiter queue.",
  questions: [
    {
      id: "notice_period_days",
      text: "What is your current notice period in days?",
      expected_format: "number",
      required: true,
    },
    {
      id: "current_ctc_lakhs",
      text: "What is your current CTC in LPA?",
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
      id: "core_tooling",
      text: "What tools/languages do you use most (for example Python, SQL, Spark, PyTorch, Airflow)?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "impact_project",
      text: "Describe one project where your model/data pipeline had measurable business impact.",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "deployment_monitoring",
      text: "How do you validate and monitor model/data quality in production?",
      expected_format: "free_text",
      required: true,
    },
    {
      id: "location_preference",
      text: "Location preference: 1) onsite Bangalore 2) hybrid 3) remote-only.",
      expected_format: "enum",
      enum_values: ["1", "2", "3"],
      required: false,
    },
  ],
  closing:
    "Thanks {candidate_name}. We have shared your inputs with the recruiter and they will revert with next steps.",
};
