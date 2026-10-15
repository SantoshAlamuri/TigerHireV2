/**
 * Organisation slug for `/apply/[slug]` E2E tests.
 * Set `E2E_APPLY_ORG_SLUG` in `.env.local` (loaded by `next dev`) or the shell
 * so Playwright hits an org that actually exists in your Supabase.
 * @default "finstack" (pilot demo org; must exist in DB or tests will 404/empty)
 */
const raw = (process.env.E2E_APPLY_ORG_SLUG || "finstack").trim();
const slug = raw.replace(/^\/+|\/+$/g, "").replace(/[^a-z0-9-_]/gi, "") || "finstack";

export const e2eApplyOrgSlug = slug;

export function applyPagePath(): string {
  return `/apply/${e2eApplyOrgSlug}`;
}
