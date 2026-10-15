import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  BULK_INVITE_MAX_ROWS,
  bulkInviteCsvSchema,
  bulkInviteRowSchema,
  inviteMemberSchema,
  patchMemberOrgAdminSchema,
  patchMemberStatusSchema,
} from "@/lib/validations/organisations";
import { writeAuditLog } from "@/lib/repositories/integrations.repository";
import { deleteCachedAuthProfile } from "@/lib/redis/auth-profile-cache";
import { sendInviteEmail } from "@/lib/services/resend";
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
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
import { ProfileRepository } from "@/lib/repositories/ProfileRepository";
import { logger } from "@/lib/observability/logger";
import crypto from "crypto";
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/security/rate-limit";
import { validateOrigin } from "@/lib/security/csrf";

interface BulkInviteRejectedRow {
  row: number;
  email?: string;
  reason: string;
}

interface BulkInviteAcceptedRow {
  row: number;
  email: string;
  role: string;
  status: "created" | "skipped";
  reason?: string;
}

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
    .filter((line) => line.length > 0);
  if (lines.length <= 1) return [];

  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const emailIndex = headers.indexOf("email");
  const roleIndex = headers.indexOf("role");
  const fullNameIndex = headers.findIndex(
    (header) => header === "full_name" || header === "fullname",
  );

  if (emailIndex === -1) {
    throw new Error("CSV must include an email column");
  }

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

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency", "hiring_manager")) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId) return jsonError("No organisation associated", 400);

    const supabase = await createSupabaseServerClient();
    const [members, invites] = await Promise.all([
      OrganisationRepository.getMembers(supabase, ctx.organisationId),
      OrganisationRepository.getPendingInvites(supabase, ctx.organisationId),
    ]);

    return jsonSuccess({ members, pendingInvites: invites });
  } catch (err) {
    return handleApiError(err, "Failed to fetch members", {
      route: "GET /api/organisations/members",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership", "recruiter", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "POST /api/organisations/members");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;
    const admin = createSupabaseAdmin();
    const supabase = await createSupabaseServerClient();
    const inviterProfile = await ProfileRepository.getById(supabase, ctx.userId);

    const bulkParsed = bulkInviteCsvSchema.safeParse(body);
    const targetOrganisationId =
      bulkParsed.success && hasRole(ctx, "super_admin")
        ? (bulkParsed.data.organisationId ?? ctx.organisationId)
        : ctx.organisationId;
    if (!targetOrganisationId) return jsonError("No organisation associated", 400);

    const org = await OrganisationRepository.getById(supabase, targetOrganisationId);
    const organisationName = org?.name ?? "your company";

    // Role hierarchy: only super_admin / leadership may grant the elevated
    // "leadership" role. A recruiter/agency must not be able to invite leadership.
    const canInviteLeadership = hasRole(ctx, "super_admin", "leadership");

    if (bulkParsed.success) {
      const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      const rl = await checkRateLimit({
        key: `org:bulk-invite:${targetOrganisationId}:${ip}`,
        ...RATE_LIMIT_PRESETS.default,
      });
      if (!rl.allowed) return jsonError("Too many import attempts, please try again shortly", 429);

      const parsedRows = parseCsvRows(bulkParsed.data.csv);
      if (parsedRows.length === 0) {
        return jsonError("No invite rows found in CSV", 422);
      }
      if (parsedRows.length > BULK_INVITE_MAX_ROWS) {
        return jsonError(`CSV exceeds maximum of ${BULK_INVITE_MAX_ROWS} rows`, 422);
      }

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
      const fileEmailSet = new Set<string>();

      const accepted: BulkInviteAcceptedRow[] = [];
      const rejected: BulkInviteRejectedRow[] = [];
      let createdCount = 0;

      for (const row of parsedRows) {
        const normalizedEmail = row.email.trim().toLowerCase();
        if (!normalizedEmail) {
          rejected.push({ row: row.row, reason: "Missing email" });
          continue;
        }
        if (fileEmailSet.has(normalizedEmail)) {
          rejected.push({ row: row.row, email: normalizedEmail, reason: "Duplicate email in CSV" });
          continue;
        }
        fileEmailSet.add(normalizedEmail);

        const rowResult = bulkInviteRowSchema.safeParse({
          email: normalizedEmail,
          role: row.role || "recruiter",
          fullName: row.fullName,
        });
        if (!rowResult.success) {
          rejected.push({
            row: row.row,
            email: normalizedEmail,
            reason: rowResult.error.issues[0]?.message ?? "Invalid row",
          });
          continue;
        }

        if (rowResult.data.role === "leadership" && !canInviteLeadership) {
          rejected.push({
            row: row.row,
            email: normalizedEmail,
            reason: "You are not permitted to invite a leadership member",
          });
          continue;
        }

        if (pendingEmailSet.has(normalizedEmail)) {
          accepted.push({
            row: row.row,
            email: normalizedEmail,
            role: rowResult.data.role,
            status: "skipped",
            reason: "Pending invite already exists",
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
            role: rowResult.data.role,
            expires_at: expiresAt.toISOString(),
          });

          try {
            await sendInviteEmail({
              email: normalizedEmail,
              inviterName: inviterProfile?.full_name ?? "Your team",
              organisationName,
              token,
            });
          } catch (emailErr) {
            logger.warn("Bulk invite email send failed (invite still created)", {
              error: String(emailErr),
              email: normalizedEmail,
            });
          }
        }

        createdCount++;
        accepted.push({
          row: row.row,
          email: normalizedEmail,
          role: rowResult.data.role,
          status: "created",
        });
      }

      return jsonSuccess({
        import: {
          dryRun: bulkParsed.data.dryRun,
          totalRows: parsedRows.length,
          accepted: accepted.length,
          rejected: rejected.length,
          created: bulkParsed.data.dryRun ? 0 : createdCount,
        },
        accepted,
        rejected,
      });
    }

    const parsed = inviteMemberSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const { email, role } = parsed.data;
    if (role === "leadership" && !canInviteLeadership) {
      return jsonError("You are not permitted to invite a leadership member", 403);
    }
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await OrganisationRepository.findPendingInvite(
      admin,
      normalizedEmail,
      targetOrganisationId,
    );
    if (existing) return jsonError("An invite is already pending for this email", 409);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await OrganisationRepository.createInvite(admin, {
      token,
      email: normalizedEmail,
      organisation_id: targetOrganisationId,
      invited_by: ctx.userId,
      role,
      expires_at: expiresAt.toISOString(),
    });

    try {
      await sendInviteEmail({
        email: normalizedEmail,
        inviterName: inviterProfile?.full_name ?? "Your team",
        organisationName,
        token,
      });
    } catch (emailErr) {
      logger.warn("Invite email send failed (invite still created)", {
        error: String(emailErr),
      });
    }

    return jsonSuccess({ message: "Invite sent", email: normalizedEmail }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to send invite", {
      route: "POST /api/organisations/members",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation associated", 400);

    const parsedBody = await parseJsonBody<Record<string, unknown>>(
      request,
      "PATCH /api/organisations/members",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const body = parsedBody.body;

    const orgAdminPatch = patchMemberOrgAdminSchema.safeParse(body);
    if (orgAdminPatch.success) {
      if (!ctx.isOrgAdmin) return jsonError("Forbidden", 403);
      // Granting/revoking org-admin is privilege escalation: restrict to
      // super_admin or leadership. A recruiter who merely holds the is_org_admin
      // flag must not be able to mint further org admins.
      if (!hasRole(ctx, "super_admin", "leadership")) {
        return jsonError("Forbidden", 403);
      }

      const { userId, isOrgAdmin } = orgAdminPatch.data;
      const admin = createSupabaseAdmin();

      const { data: profile } = await admin
        .from("profiles")
        .select("id, organisation_id, is_org_admin, full_name")
        .eq("id", userId)
        .single();
      if (!profile || profile.organisation_id !== ctx.organisationId) {
        return jsonError("Member not found in organisation", 404);
      }

      if (userId === ctx.userId && !isOrgAdmin) {
        const { count } = await admin
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", ctx.organisationId)
          .eq("is_org_admin", true);
        if ((count ?? 0) <= 1) {
          return jsonError("Cannot remove the last organisation admin", 409);
        }
      }

      const { error } = await admin
        .from("profiles")
        .update({
          is_org_admin: isOrgAdmin,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (error) return jsonError("Failed to update member admin status", 500);

      // Bust the toggled user's cached auth profile so their next request sees
      // the new is_org_admin immediately, not the 60s-stale value (Org #12).
      await deleteCachedAuthProfile(userId);

      const supabase = await createSupabaseServerClient();
      await writeAuditLog(supabase, {
        organisation_id: ctx.organisationId,
        actor_user_id: ctx.userId,
        actor_email: null,
        event_type: "team.member_org_admin_updated",
        resource_type: "profile",
        resource_id: userId,
        metadata: {
          target_name: profile.full_name,
          is_org_admin: isOrgAdmin,
        },
      });

      return jsonSuccess({ ok: true, userId, isOrgAdmin });
    }

    const statusPatch = patchMemberStatusSchema.safeParse(body);
    if (!statusPatch.success) {
      return handleZodError(statusPatch.error);
    }
    if (!hasRole(ctx, "super_admin", "leadership", "agency")) {
      return jsonError("Forbidden", 403);
    }

    const { userId, isActive } = statusPatch.data;
    const admin = createSupabaseAdmin();
    const { data: profile } = await admin
      .from("profiles")
      .select("id, organisation_id")
      .eq("id", userId)
      .single();
    if (!profile || profile.organisation_id !== ctx.organisationId) {
      return jsonError("Member not found in organisation", 404);
    }

    const { error } = await admin
      .from("profiles")
      .update({
        is_active: isActive,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    if (error) return jsonError("Failed to update member status", 500);

    return jsonSuccess({ ok: true, userId, isActive });
  } catch (err) {
    return handleApiError(err, "Failed to update member", {
      route: "PATCH /api/organisations/members",
    });
  }
}
