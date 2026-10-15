/** Shared role checks for the company-side consultant (agency) screens. */

/** Company staff who may see which firms have access. */
export function canViewConsultants(ctx: { role: string }): boolean {
  return ["super_admin", "leadership", "recruiter"].includes(ctx.role);
}

/** Only leadership (or a platform/org admin) may invite, revoke, or remove a firm. */
export function canManageConsultants(ctx: { role: string; isOrgAdmin?: boolean }): boolean {
  return ctx.role === "super_admin" || ctx.role === "leadership" || Boolean(ctx.isOrgAdmin);
}
