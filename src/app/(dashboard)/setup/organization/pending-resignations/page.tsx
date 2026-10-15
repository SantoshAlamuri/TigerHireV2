import { redirect } from "next/navigation";

/**
 * Canonical URL for this page is /company/pending-resignations.
 *
 * This path used to re-export the same component, so one page answered on two
 * URLs — two entries in the route tree, two things to test, and no single
 * source of truth. It redirects now so existing links and bookmarks keep working.
 */
export default function SetupOrganizationPendingResignationsRedirectPage() {
  redirect("/company/pending-resignations");
}
