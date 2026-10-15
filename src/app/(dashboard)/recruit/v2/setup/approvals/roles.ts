/** Approver roles a chain step can name. Shared by the builder and the step row. */
export const ROLES = [
  { value: "recruiter", label: "Recruiter" },
  { value: "leadership", label: "Company Admin" },
  { value: "hiring_manager", label: "Hiring Manager" },
  { value: "finance", label: "Finance" },
] as const;

export const LABELS = Object.fromEntries(ROLES.map((r) => [r.value, r.label]));
