/** Mirrors public-role eligibility. Missing data is never proof of availability. */
export function jobPublicationState(
  job:
    | {
        status?: string | null;
        is_active?: boolean | null;
        list_on_public_job_board?: boolean | null;
      }
    | null
    | undefined,
): { label: string; publicApplications: boolean; detail: string } {
  if (!job) return { label: "Checking status", publicApplications: false, detail: "" };
  if (job.status === "draft")
    return {
      label: "Draft",
      publicApplications: false,
      detail: "Not published — candidates cannot apply to this role.",
    };
  if (job.status === "closed")
    return {
      label: "Closed",
      publicApplications: false,
      detail: "This role is closed to applications.",
    };
  if (job.status === "open" && job.is_active === true && job.list_on_public_job_board === true)
    return {
      label: "Published",
      publicApplications: true,
      detail: "Open for public applications.",
    };
  if (job.status === "open")
    return {
      label: "Open · not publicly listed",
      publicApplications: false,
      detail: "Public availability is not enabled or has not been confirmed.",
    };
  return {
    label: "Availability unconfirmed",
    publicApplications: false,
    detail: "Check job settings before sharing an application link.",
  };
}
