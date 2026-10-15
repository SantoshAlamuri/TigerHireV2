export const JOB_ROLE_CATEGORIES = [
  "backend",
  "frontend",
  "data_ml",
  "product",
  "devops",
  "design",
  "sales",
  "finance",
] as const;

export const JOB_CITIES = [
  "bangalore",
  "delhi_ncr",
  "mumbai",
  "hyderabad",
  "chennai",
  "pune",
  "remote",
] as const;

export const JOB_SOURCES = ["greenhouse", "lever", "adzuna", "jsearch"] as const;

export type RoleCategory = (typeof JOB_ROLE_CATEGORIES)[number];
export type City = (typeof JOB_CITIES)[number];
export type JobSource = (typeof JOB_SOURCES)[number];
export type JobTier = "native" | "aggregated";

export interface NormalizedJob {
  source: JobSource;
  source_job_id: string;
  source_url: string;
  title: string;
  company: string;
  description: string;
  city: City | null;
  role_category: RoleCategory | null;
  posted_at: Date | null;
  raw: unknown;
}

export interface SourceFetchItem {
  raw: unknown;
  normalized: NormalizedJob | null;
}

export interface SourceFetchResult {
  source: JobSource;
  items: SourceFetchItem[];
  fetched: number;
  failed: number;
}
