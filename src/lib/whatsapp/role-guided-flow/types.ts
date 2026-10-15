export type RoleOption = {
  label: string;
  matchField: "role_function" | "title";
  matchValue: string;
  count: number;
};

export type JobOption = {
  id: string;
  title: string;
  location: string;
  roleFunction: string | null;
};

export const MAX_ROLE_OPTIONS = 8;
export const MAX_JOB_OPTIONS = 8;
