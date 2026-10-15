import { NextRequest } from "next/server";
import crypto from "crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  hasRole,
  parseJsonBody,
  jsonError,
  jsonSuccess,
  handleZodError,
  handleApiError,
} from "@/lib/api-helpers";
import {
  BULK_INVITE_MAX_ROWS,
  adminDeleteUserSchema,
  adminInviteUserSchema,
  adminUpdateUserSchema,
  bulkInviteCsvSchema,
  bulkInviteRowSchema,
} from "@/lib/validations/organisations";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
import { ProfileRepository } from "@/lib/repositories/ProfileRepository";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { sendInviteEmail } from "@/lib/services/resend";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { logger } from "@/lib/observability/logger";
import { validateOrigin } from "@/lib/security/csrf";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_OFFSET = 20_000;
const ADMIN_USER_LIST_SELECT_FIELDS =
  "id, full_name, role, created_at, organisation_id, is_active, organisations(id, name)";
const ADMIN_USER_UPDATE_SELECT_FIELDS =
  "id, full_name, role, created_at, organisation_id, is_active, updated_at";

interface ParsedCsvRow {
  row: number;
  email: string;
  role?: string;
  fullName?: string;
}

function parseCsvRows(csv: string): ParsedCsvRow[] {
  const lines = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return [];
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const emailIndex = headers.indexOf("email");
  const roleIndex = headers.indexOf("role");
  const fullNameIndex = headers.findIndex(
    (header) => header === "full_name" || header === "fullname",
  );
  if (emailIndex === -1) throw new Error("CSV must include an email column");
  const rows: ParsedCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((value) => value.trim());
    rows.push({
      row: i + 1,
      email: values[emailIndex] ?? "",
      role: roleIndex >= 0 ? values[roleIndex] : undefined,
      fullName: fullNameIndex >= 0 ? values[fullNameIndex] : undefined,
    });
  }
  return rows;
}

function parseListParams(searchParams: URLSearchParams) {
  const rawRole = searchParams.get("role");
  const rawSearch = searchParams.get("search");
  const role = rawRole?.trim() || null;
  const search = rawSearch?.trim() ?? "";

  const rawLimit = searchParams.get("limit");
  const rawOffset = searchParams.get("offset");
  const rawPage = searchParams.get("page");

  const parsedLimit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
    return { error: "Invalid limit: expected an integer >= 1" as const };
  }
  const limit = Math.min(parsedLimit, MAX_LIMIT);

  let offset: number;
  if (rawOffset !== null) {
    const parsedOffset = Number.parseInt(rawOffset, 10);
    if (!Number.isInteger(parsedOffset) || parsedOffset < 0) {
      return { error: "Invalid offset: expected an integer >= 0" as const };
    }
    offset = Math.min(parsedOffset, MAX_OFFSET);
  } else {
    const parsedPage = rawPage === null ? 1 : Number.parseInt(rawPage, 10);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      return { error: "Invalid page: expected an integer >= 1" as const };
    }
    offset = (parsedPage - 1) * limit;
  }

  return { role, search, limit, offset };
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsed = parseListParams(request.nextUrl.searchParams);
    if ("error" in parsed) return jsonError(String(parsed.error), 400);
    const { role, search, limit, offset } = parsed;
    const page = Math.floor(offset / limit) + 1;

    const supabase = await createSupabaseServerClient();
    let query = supabase
      .from("profiles")
      .select(ADMIN_USER_LIST_SELECT_FIELDS, { count: "exact" })
      .order("created_at", { ascending: false });

    if (role) query = query.eq("role", role);
    if (search) query = query.ilike("full_name", `%${search}%`);
    query = query.range(offset, offset + limit - 1);

    const { data: users, error, count } = await query;
    if (error) return jsonError("Failed to fetch users", 500);

    // Emails live in auth.users (not profiles); enrich via the admin API.
    // Best-effort: a failure here should not take down the listing.
    const emailById = new Map<string, string>();
    try {
      const admin = createSupabaseAdmin();
      const wanted = new Set((users ?? []).map((u) => (u as { id: string }).id));
      const PER_PAGE = 1000;
      for (let authPage = 1; authPage <= 10 && emailById.size < wanted.size; authPage++) {
        const { data: batch, error: listError } = await admin.auth.admin.listUsers({
          page: authPage,
          perPage: PER_PAGE,
        });
        if (listError || !batch?.users?.length) break;
        for (const authUser of batch.users) {
          if (wanted.has(authUser.id) && authUser.email) emailById.set(authUser.id, authUser.email);
        }
        if (batch.users.length < PER_PAGE) break;
      }
    } catch (emailErr) {
      logger.warn("Failed to enrich admin user list with emails", { error: String(emailErr) });
    }

    return jsonSuccess({
      users: (users ?? []).map((u) => ({
        ...u,
        email: emailById.get((u as { id: string }).id) ?? null,
      })),
      pagination: {
        page,
        limit,
        total: count ?? 0,
        totalPages: Math.ceil((count ?? 0) / limit),
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch users", {
      route: "GET /api/admin/users",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "PATCH /api/admin/users");
    if (errorResponse) return errorResponse;

    const parsed = adminUpdateUserSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { userId, role, fullName, email, organisationId, isActive } = parsed.data;

    if (isActive === false && userId === ctx.userId) {
      return jsonError("You cannot deactivate your own account", 400);
    }

    const admin = createSupabaseAdmin();

    // Capture prior values for the audit trail before mutating.
    const { data: previous } = await admin
      .from("profiles")
      .select("role, full_name, organisation_id, is_active")
      .eq("id", userId)
      .maybeSingle();
    const previousProfile = previous as {
      role?: string | null;
      full_name?: string | null;
      organisation_id?: string | null;
      is_active?: boolean | null;
    } | null;

    if (organisationId) {
      const org = await OrganisationRepository.getById(admin, organisationId);
      if (!org) return jsonError("Organisation not found", 404);
    }

    // Email lives on auth.users, not profiles. Update it first: it is the most
    // likely to fail (duplicate address), and the profile is still untouched then.
    if (email !== undefined) {
      const { error: authError } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (authError) {
        return jsonError(authError.message || "Failed to update email", 400);
      }
    }

    const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (role !== undefined) profileUpdate.role = role;
    if (fullName !== undefined) profileUpdate.full_name = fullName;
    if (organisationId !== undefined) profileUpdate.organisation_id = organisationId;
    if (isActive !== undefined) profileUpdate.is_active = isActive;

    const { data: updated, error } = await admin
      .from("profiles")
      .update(profileUpdate)
      .eq("id", userId)
      .select(ADMIN_USER_UPDATE_SELECT_FIELDS)
      .single();

    if (error) return jsonError("Failed to update user", 500);

    await deleteCachedAuthProfile(userId);

    // Audit the privileged update (actor, target, old/new values).
    const changes: Record<string, unknown> = {};
    if (role !== undefined) {
      changes.old_role = previousProfile?.role ?? null;
      changes.new_role = role;
    }
    if (fullName !== undefined) {
      changes.old_full_name = previousProfile?.full_name ?? null;
      changes.new_full_name = fullName;
    }
    if (organisationId !== undefined) {
      changes.old_organisation_id = previousProfile?.organisation_id ?? null;
      changes.new_organisation_id = organisationId;
    }
    if (email !== undefined) changes.email_changed = true;
    if (isActive !== undefined) {
      changes.old_is_active = previousProfile?.is_active ?? null;
      changes.new_is_active = isActive;
    }

    const targetOrganisationId =
      (updated as { organisation_id?: string | null } | null)?.organisation_id ??
      previousProfile?.organisation_id ??
      null;
    if (targetOrganisationId) {
      try {
        const supabase = await createSupabaseServerClient();
        await writeAuditLog(supabase, {
          organisation_id: targetOrganisationId,
          actor_user_id: ctx.userId,
          actor_email: null,
          event_type: "admin.user_updated",
          resource_type: "profile",
          resource_id: userId,
          metadata: changes,
        });
      } catch (auditErr) {
        logger.warn("Failed to write audit log for admin user update", {
          user_id: userId,
          error: String(auditErr),
        });
      }
    }

    logger.info("Admin user update", { user_id: userId, fields: Object.keys(changes) });
    return jsonSuccess({ user: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update user", {
      route: "PATCH /api/admin/users",
    });
  }
}

/**
 * DELETE /api/admin/users — permanently remove a user's sign-in and profile.
 * Body: { userId }. The profiles row cascades from auth.users; tables with
 * NO ACTION FKs (recruitment plans, referrals, invites, …) block deletion for
 * users with history — those return 409 with a hint to deactivate instead.
 */
export async function DELETE(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "DELETE /api/admin/users");
    if (errorResponse) return errorResponse;
    const parsed = adminDeleteUserSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { userId } = parsed.data;

    if (userId === ctx.userId) {
      return jsonError("You cannot delete your own account", 400);
    }

    const admin = createSupabaseAdmin();
    const { data: target } = await admin
      .from("profiles")
      .select("full_name, role, organisation_id")
      .eq("id", userId)
      .maybeSingle();
    if (!target) return jsonError("User not found", 404);
    const targetProfile = target as {
      full_name?: string | null;
      role?: string | null;
      organisation_id?: string | null;
    };

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      const message = deleteError.message || "";
      // FK restrictions surface as a database error from GoTrue when the
      // profile cascade is blocked by referencing rows.
      if (/foreign key|violates|constraint/i.test(message)) {
        return jsonError(
          "This user has activity (plans, referrals, or invites) that prevents deletion. Deactivate the account instead.",
          409,
        );
      }
      logger.error("Admin user delete failed", { user_id: userId, error: message });
      return jsonError("Failed to delete user", 500);
    }

    await deleteCachedAuthProfile(userId);

    if (targetProfile.organisation_id) {
      try {
        const supabase = await createSupabaseServerClient();
        await writeAuditLog(supabase, {
          organisation_id: targetProfile.organisation_id,
          actor_user_id: ctx.userId,
          actor_email: null,
          event_type: "admin.user_deleted",
          resource_type: "profile",
          resource_id: userId,
          metadata: {
            deleted_full_name: targetProfile.full_name ?? null,
            deleted_role: targetProfile.role ?? null,
          },
        });
      } catch (auditErr) {
        logger.warn("Failed to write audit log for admin user delete", {
          user_id: userId,
          error: String(auditErr),
        });
      }
    }

    logger.info("Admin user deleted", { user_id: userId, deleted_by: ctx.userId });
    return jsonSuccess({ deleted: true, userId });
  } catch (err) {
    return handleApiError(err, "Failed to delete user", {
      route: "DELETE /api/admin/users",
    });
  }
}

/**
 * POST /api/admin/users — Platform admin invite: add a user to an organisation
 * (e.g. employee, recruiter, leadership, hiring_manager).
 * Sends an invite email; user accepts via the /invite/[token] flow.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const parsedBody = await parseJsonBody(request, "POST /api/admin/users");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const bulkParsed = bulkInviteCsvSchema.safeParse(parsedBody.body);
    if (bulkParsed.success) {
      const targetOrganisationId = bulkParsed.data.organisationId;
      if (!targetOrganisationId)
        return jsonError("organisationId is required for bulk invite", 422);
      const rows = parseCsvRows(bulkParsed.data.csv);
      if (rows.length === 0) return jsonError("No invite rows found in CSV", 422);
      if (rows.length > BULK_INVITE_MAX_ROWS) {
        return jsonError(`CSV exceeds maximum of ${BULK_INVITE_MAX_ROWS} rows`, 422);
      }

      const admin = createSupabaseAdmin();
      const supabase = await createSupabaseServerClient();
      const inviterProfile = await ProfileRepository.getById(supabase, ctx.userId);
      const org = await OrganisationRepository.getById(supabase, targetOrganisationId);

      const accepted: Array<{
        row: number;
        email: string;
        role: string;
        status: "created" | "skipped";
      }> = [];
      const rejected: Array<{ row: number; email?: string; reason: string }> = [];
      const pendingInvites = await OrganisationRepository.getPendingInvites(
        admin,
        targetOrganisationId,
      );
      const pendingEmailSet = new Set(
        pendingInvites
          .map((invite) =>
            String(invite.email ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      );
      const csvEmailSet = new Set<string>();

      for (const row of rows) {
        const normalizedEmail = row.email.trim().toLowerCase();
        if (!normalizedEmail) {
          rejected.push({ row: row.row, reason: "Missing email" });
          continue;
        }
        if (csvEmailSet.has(normalizedEmail)) {
          rejected.push({ row: row.row, email: normalizedEmail, reason: "Duplicate email in CSV" });
          continue;
        }
        csvEmailSet.add(normalizedEmail);

        const validated = bulkInviteRowSchema.safeParse({
          email: normalizedEmail,
          role: row.role || "recruiter",
          fullName: row.fullName,
        });
        if (!validated.success) {
          rejected.push({
            row: row.row,
            email: normalizedEmail,
            reason: validated.error.issues[0]?.message ?? "Invalid row",
          });
          continue;
        }
        if (pendingEmailSet.has(normalizedEmail)) {
          accepted.push({
            row: row.row,
            email: normalizedEmail,
            role: validated.data.role,
            status: "skipped",
          });
          continue;
        }

        if (!bulkParsed.data.dryRun) {
          const token = crypto.randomBytes(32).toString("hex");
          const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          await OrganisationRepository.createInvite(admin, {
            token,
            email: normalizedEmail,
            organisation_id: targetOrganisationId,
            invited_by: ctx.userId,
            role: validated.data.role,
            expires_at: expiresAt.toISOString(),
          });
          try {
            await sendInviteEmail({
              email: normalizedEmail,
              inviterName: inviterProfile?.full_name ?? row.fullName ?? "Platform Admin",
              organisationName: org?.name ?? "the organisation",
              token,
            });
          } catch (emailErr) {
            logger.warn("Admin bulk invite email send failed", {
              email: normalizedEmail,
              error: String(emailErr),
            });
          }
        }
        accepted.push({
          row: row.row,
          email: normalizedEmail,
          role: validated.data.role,
          status: "created",
        });
      }

      return jsonSuccess({
        dryRun: bulkParsed.data.dryRun,
        organisationId: targetOrganisationId,
        summary: {
          totalRows: rows.length,
          accepted: accepted.length,
          rejected: rejected.length,
          created: accepted.filter((item) => item.status === "created").length,
          skipped: accepted.filter((item) => item.status === "skipped").length,
        },
        accepted,
        rejected,
      });
    }

    const parsed = adminInviteUserSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const { email, fullName, role, organisationId } = parsed.data;
    const admin = createSupabaseAdmin();

    const existing = await OrganisationRepository.findPendingInvite(admin, email, organisationId);
    if (existing)
      return jsonError("An invite is already pending for this email in this organisation", 409);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await OrganisationRepository.createInvite(admin, {
      token,
      email,
      organisation_id: organisationId,
      invited_by: ctx.userId,
      role,
      expires_at: expiresAt.toISOString(),
    });

    const supabase = await createSupabaseServerClient();
    const inviterProfile = await ProfileRepository.getById(supabase, ctx.userId);
    const org = await OrganisationRepository.getById(supabase, organisationId);

    try {
      await sendInviteEmail({
        email,
        inviterName: inviterProfile?.full_name ?? fullName ?? "Platform Admin",
        organisationName: org?.name ?? "the organisation",
        token,
      });
    } catch (emailErr) {
      logger.warn("Admin invite email send failed (invite still created)", {
        error: String(emailErr),
      });
    }

    logger.info("Admin user invite created", {
      email,
      role,
      organisation_id: organisationId,
    });
    return jsonSuccess({ message: "Invite sent", email }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to send invite", {
      route: "POST /api/admin/users",
    });
  }
}
