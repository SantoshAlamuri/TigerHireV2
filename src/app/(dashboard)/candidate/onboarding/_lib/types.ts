export type ProfileShape = Record<string, unknown>;
export type ReferrerShape = Record<string, unknown>;
export type PreferencesShape = {
  preferred_locations?: string[];
  remote_preference?: string;
  preferred_seniority?: string[];
  preferred_role_functions?: string[];
  salary_min_lpa?: number;
  salary_max_lpa?: number;
} | null;
