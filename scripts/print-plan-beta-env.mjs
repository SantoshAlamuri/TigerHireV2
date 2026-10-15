#!/usr/bin/env node
/**
 * Prints Vercel/env instructions to enable recruitment plan beta for one org.
 * Usage: node scripts/print-plan-beta-env.mjs [organisation-slug]
 */
const slug = process.argv[2] ?? "finstack";

console.log(`
Recruitment plan beta — enable on preview/staging:

1. Apply migration (once per environment):
   npm run db:push

2. Vercel → Project → Settings → Environment Variables (Preview + Production as needed):
   FF_PLAN_DOCUMENT=true
   NEXT_PUBLIC_FF_PLAN_DOCUMENT=true
   FF_PLAN_AUTO_EXECUTE=true   # optional: stage dispatch automation

3. Redeploy preview with build cache disabled after env change.

4. Verify: open a job for org slug "${slug}" → Plan tab + readiness strip.

5. Optional org-scoped flags: Admin → runtime flags for single org instead of global env.
`);
