/**
 * These screens render inside the dashboard shell, and nothing else.
 *
 * This layout used to draw a second navigation: a left rail with its own Jobs,
 * Candidates and Analytics links — three tabs that were already on screen in
 * the top nav, one row up. The rail was written when /recruit/v2 was an unlinked
 * preview tree reachable only by URL; once its screens joined the product's own
 * nav, the rail stopped being a shell and became a duplicate that made every
 * page under it read as a different app with a different sense of "where am I".
 *
 * The three destinations it alone carried — Portfolio, Governance and Hiring
 * setup — are registry entries under Jobs now (`jobs.portfolio`,
 * `jobs.governance`, `jobs.hiring_setup` in lib/navigation/registry.ts), which
 * is what lights the Jobs tab up while one of them is open. Per-job review and
 * setup still live inside each job rather than in any nav, which is the point
 * the rail's footnote was making.
 *
 * The file stays as the anchor for that history and for any v2-wide chrome that
 * is genuinely shell — not as a place to put a second set of links.
 */
export default function RecruitV2Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
