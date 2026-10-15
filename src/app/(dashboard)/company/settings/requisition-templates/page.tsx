import { redirect } from "next/navigation";

/**
 * Pointed at /setup/hiring-config, which is org-admin-only, so a recruiter
 * following this stub got a bare 403 even though the policy allow-lists them
 * for this path. The company templates hub carries the same content and is
 * recruiter-accessible (COMPANY_HIRING_CONFIG_SETTINGS_PREFIXES).
 */
export default function CompanyRequisitionTemplatesRedirectPage() {
  redirect("/company/settings/templates?tab=requisition");
}
