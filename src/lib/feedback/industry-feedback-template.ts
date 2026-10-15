export const INDUSTRY_FEEDBACK_TEMPLATE_PREFIX = "Industry feedback";

type IndustryFeedbackField = {
  label: string;
  type: "rating" | "text";
  required: boolean;
  description: string;
};

function titleCase(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildFieldsForRole(roleFunction: string): IndustryFeedbackField[] {
  const normalized = roleFunction.trim().toLowerCase();
  const technicalRoles = new Set(["engineering", "design", "product", "data"]);
  const businessRoles = new Set(["sales", "marketing", "operations", "finance", "hr"]);

  if (technicalRoles.has(normalized)) {
    return [
      {
        label: "Domain depth",
        type: "rating",
        required: true,
        description: "Rate role-specific depth shown in interview (1-5).",
      },
      {
        label: "Problem solving",
        type: "rating",
        required: true,
        description: "Rate how well the candidate structured and solved problems.",
      },
      {
        label: "Execution quality",
        type: "rating",
        required: true,
        description: "Rate practical execution ability for this function.",
      },
      {
        label: "Communication and collaboration",
        type: "rating",
        required: true,
        description: "Rate communication clarity and cross-functional collaboration.",
      },
      {
        label: "Strengths observed",
        type: "text",
        required: false,
        description: "Top strengths relevant to this role.",
      },
      {
        label: "Risks and gaps",
        type: "text",
        required: false,
        description: "Any gaps, concerns, or coaching needs.",
      },
    ];
  }

  if (businessRoles.has(normalized)) {
    return [
      {
        label: "Functional expertise",
        type: "rating",
        required: true,
        description: "Rate core functional capability for this role (1-5).",
      },
      {
        label: "Stakeholder management",
        type: "rating",
        required: true,
        description: "Rate ability to influence and align stakeholders.",
      },
      {
        label: "Decision quality",
        type: "rating",
        required: true,
        description: "Rate judgment and quality of trade-off decisions.",
      },
      {
        label: "Ownership and pace",
        type: "rating",
        required: true,
        description: "Rate ownership mindset and execution speed.",
      },
      {
        label: "Strengths observed",
        type: "text",
        required: false,
        description: "Top strengths relevant to this role.",
      },
      {
        label: "Risks and gaps",
        type: "text",
        required: false,
        description: "Any gaps, concerns, or coaching needs.",
      },
    ];
  }

  return [
    {
      label: "Role fit",
      type: "rating",
      required: true,
      description: "Rate overall fit for role responsibilities (1-5).",
    },
    {
      label: "Competency evidence",
      type: "rating",
      required: true,
      description: "Rate quality of evidence shown for required competencies.",
    },
    {
      label: "Communication",
      type: "rating",
      required: true,
      description: "Rate clarity of communication and collaboration style.",
    },
    {
      label: "Growth potential",
      type: "rating",
      required: true,
      description: "Rate potential to grow in this role.",
    },
    {
      label: "Strengths observed",
      type: "text",
      required: false,
      description: "Top strengths relevant to this role.",
    },
    {
      label: "Risks and gaps",
      type: "text",
      required: false,
      description: "Any gaps, concerns, or coaching needs.",
    },
  ];
}

export function resolveIndustryFeedbackTemplate(roleFunction?: string | null): {
  name: string;
  fields: IndustryFeedbackField[];
} {
  const normalizedRole = roleFunction?.trim() ? titleCase(roleFunction) : "General";
  return {
    name: `${INDUSTRY_FEEDBACK_TEMPLATE_PREFIX} - ${normalizedRole}`,
    fields: buildFieldsForRole(normalizedRole),
  };
}

export async function ensureIndustryFeedbackTemplateForJob(
  supabase: { from: (table: string) => any },
  input: {
    jobId: string;
    roleFunction?: string | null;
    createdBy?: string | null;
  },
): Promise<{ id: string; name: string; fields: IndustryFeedbackField[] } | null> {
  const template = resolveIndustryFeedbackTemplate(input.roleFunction);
  const existingResult = (await (supabase
    .from("feedback_form_templates")
    .select("id, name, fields")
    .eq("job_id", input.jobId)
    .eq("name", template.name)
    .maybeSingle() as Promise<{
    data: { id: string } | null;
    error: { message?: string } | null;
  }>)) ?? {
    data: null,
    error: null,
  };

  if (existingResult.error) {
    return null;
  }

  if (existingResult.data?.id) {
    await (supabase
      .from("feedback_form_templates")
      .update({ fields: template.fields, updated_at: new Date().toISOString() })
      .eq("id", existingResult.data.id) as Promise<unknown>);
    return { id: existingResult.data.id, ...template };
  }

  const insertedResult = (await (supabase
    .from("feedback_form_templates")
    .insert({
      job_id: input.jobId,
      name: template.name,
      fields: template.fields,
      created_by: input.createdBy ?? null,
    })
    .select("id")
    .single() as Promise<{ data: { id: string } | null; error: { message?: string } | null }>)) ?? {
    data: null,
    error: null,
  };

  if (insertedResult.error || !insertedResult.data?.id) {
    return null;
  }

  return { id: insertedResult.data.id, ...template };
}
