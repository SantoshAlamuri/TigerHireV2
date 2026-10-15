/**
 * Homepage “Featured openings” list (expandable section).
 * Add entries when you want to promote specific roles — link to /jobs/[id], /apply/[slug], or full URLs.
 */
export type FeaturedOpening = {
  /** Stable key for React lists */
  id: string;
  title: string;
  /** Internal path (e.g. /jobs/abc) or absolute URL */
  href: string;
  company?: string;
  location?: string;
};

export const FEATURED_OPENINGS: FeaturedOpening[] = [
  // Example (uncomment and edit when ready):
  // {
  //   id: "example-1",
  //   title: "Senior Backend Engineer",
  //   href: "/jobs/your-job-uuid",
  //   company: "Your client or hiring org",
  //   location: "Bengaluru",
  // },
];
