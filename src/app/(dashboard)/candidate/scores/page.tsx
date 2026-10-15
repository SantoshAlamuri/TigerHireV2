import { redirect } from "next/navigation";

/**
 * Fit scores merged into Applications (each application expands to its own
 * breakdown). This route is kept as a redirect so old links/bookmarks resolve.
 */
export default function CandidateScoresRedirect() {
  redirect("/candidate/applications");
}
