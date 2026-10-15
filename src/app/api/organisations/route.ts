import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createOrganisationSchema,
  updateOrganisationSchema,
} from "@/lib/validations/organisations";
import { getBillingPlans } from "@/lib/services/stripe";
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
import { validateOrigin } from "@/lib/security/csrf";
import { logger } from "@/lib/observability/logger";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_OFFSET = 10_000;

const ORGANISATION_ALL_COLUMNS =
  "id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at, email_domain, enforce_2fa, enforce_sso";

function parsePaginationParams(url: URL) {
  const rawLimit = url.searchParams.get("limit");
  const rawOffset = url.searchParams.get("offset");
  const limit = rawLimit === null ? DEFAULT_LIMIT : Number.parseInt(rawLimit, 10);
  const offset = rawOffset === null ? 0 : Number.parseInt(rawOffset, 10);

  if (!Number.isInteger(limit) || limit < 1) {
    return { error: "Invalid limit: expected an integer >= 1" as const };
  }
  if (!Number.isInteger(offset) || offset < 0) {
    return { error: "Invalid offset: expected an integer >= 0" as const };
  }

  return {
    limit: Math.min(limit, MAX_LIMIT),
    offset: Math.min(offset, MAX_OFFSET),
  };
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeEmailDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const value = trimmed.includes("@") ? (trimmed.split("@").pop() ?? "") : trimmed;
  return value.replace(/^@+/, "").trim() || null;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    // is_org_admin is orthogonal to role: an org administrator may view the org
    // page regardless of recruitment function (Org #12). Server stays the gate.
    if (!hasRole(ctx, "super_admin", "leadership", "agency") && !ctx.isOrgAdmin) {
      return jsonError("Forbidden", 403);
    }
    if (!ctx.organisationId && !hasRole(ctx, "super_admin")) {
      return jsonError("No organisation associated with your account", 400);
    }

    const supabase = await createSupabaseServerClient();

    if (hasRole(ctx, "super_admin")) {
      const pagination = parsePaginationParams(new URL(request.url));
      if ("error" in pagination) return jsonError(String(pagination.error), 400);
      const { limit, offset } = pagination;
      const { data, error, count } = await supabase
        .from("organisations")
        .select(ORGANISATION_ALL_COLUMNS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return jsonError("Failed to fetch organisations", 500);
      const total = count ?? 0;
      return jsonSuccess({
        organisations: data ?? [],
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + (data?.length ?? 0) < total,
        },
      });
    }

    if (hasRole(ctx, "agency")) {
      const pagination = parsePaginationParams(new URL(request.url));
      if ("error" in pagination) return jsonError(String(pagination.error), 400);
      const { limit, offset } = pagination;
      const { data: links, error: linkError } = await supabase
        .from("agency_clients")
        .select("client_organisation_id")
        .eq("agency_organisation_id", ctx.organisationId!);

      if (linkError) {
        logger.warn("Agency clients fetch failed (table or RLS)", {
          error: String(linkError.message),
          code: linkError.code,
        });
        return jsonSuccess({
          organisations: [],
          pagination: {
            limit,
            offset,
            total: 0,
            hasMore: false,
          },
        });
      }
      const clientIds = (links ?? []).map(
        (r: { client_organisation_id: string }) => r.client_organisation_id,
      );

      if (clientIds.length === 0) {
        return jsonSuccess({
          organisations: [],
          pagination: {
            limit,
            offset,
            total: 0,
            hasMore: false,
          },
        });
      }

      const {
        data: clientOrgs,
        error: orgError,
        count,
      } = await supabase
        .from("organisations")
        .select(ORGANISATION_ALL_COLUMNS, { count: "exact" })
        .in("id", clientIds)
        .order("name")
        .range(offset, offset + limit - 1);

      if (orgError) {
        logger.warn("Agency client organisations fetch failed", {
          error: String(orgError.message),
        });
        return jsonSuccess({
          organisations: [],
          pagination: {
            limit,
            offset,
            total: 0,
            hasMore: false,
          },
        });
      }
      const total = count ?? 0;
      return jsonSuccess({
        organisations: clientOrgs ?? [],
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + (clientOrgs?.length ?? 0) < total,
        },
      });
    }

    const { data: org, error } = await supabase
      .from("organisations")
      .select(ORGANISATION_ALL_COLUMNS)
      .eq("id", ctx.organisationId!)
      .single();

    if (error || !org) return jsonError("Organisation not found", 404);

    // Count team members
    const { count: memberCount } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", ctx.organisationId!);

    // Count active jobs
    const { count: jobCount } = await supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", ctx.organisationId!)
      .eq("status", "open");

    // Count unlocks this month
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: unlockCount } = await supabase
      .from("candidate_unlocks")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", ctx.organisationId!)
      .gte("created_at", startOfMonth.toISOString());

    const unlocksUsed = unlockCount ?? 0;
    const plans = await getBillingPlans();
    const planKey = (org.company_plan as string) ?? "starter";
    const unlockQuota = plans.company[planKey]?.unlocks ?? 5;
    return jsonSuccess({
      organisation: {
        ...org,
        unlocks_used: unlocksUsed,
        unlock_quota: unlockQuota, // -1 = unlimited; pass through so mapper/UI show unlimited
      },
      stats: {
        members: memberCount ?? 0,
        activeJobs: jobCount ?? 0,
        unlocksThisMonth: unlocksUsed,
      },
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch organisation", {
      route: "GET /api/organisations",
    });
  }
}

export async function PATCH(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);

    if (!hasRole(ctx, "super_admin", "leadership") && !ctx.isOrgAdmin) {
      return jsonError("Forbidden", 403);
    }

    const parsedBody = await parseJsonBody(request, "PATCH /api/organisations");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = updateOrganisationSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const isSuperAdmin = hasRole(ctx, "super_admin");
    const targetOrgId = isSuperAdmin ? parsed.data.organisationId : null;

    if (targetOrgId) {
      if (!isSuperAdmin) return jsonError("Forbidden", 403);
      // Super admin updating another organisation (e.g. approval)
      const supabase = createSupabaseAdmin();
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (parsed.data.approval !== undefined) updateData.approval = parsed.data.approval;
      if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
      if (parsed.data.slug !== undefined) updateData.slug = normalizeSlug(parsed.data.slug);
      if (parsed.data.email_domain !== undefined) {
        updateData.email_domain = normalizeEmailDomain(parsed.data.email_domain);
      }
      if (parsed.data.enforce_sso !== undefined) updateData.enforce_sso = parsed.data.enforce_sso;
      if (parsed.data.enforce_2fa !== undefined) updateData.enforce_2fa = parsed.data.enforce_2fa;

      const { data: updated, error } = await supabase
        .from("organisations")
        .update(updateData)
        .eq("id", targetOrgId)
        .select(ORGANISATION_ALL_COLUMNS)
        .single();

      if (error) {
        logger.error("Organisation update failed", { error: String(error) });
        return jsonError("Failed to update organisation", 500);
      }
      return jsonSuccess({ organisation: updated });
    }

    if (!ctx.organisationId) {
      return jsonError("No organisation associated with your account", 400);
    }

    const supabase = await createSupabaseServerClient();
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.name) updateData.name = parsed.data.name;
    if (parsed.data.slug) updateData.slug = parsed.data.slug;
    if (parsed.data.email_domain !== undefined) {
      updateData.email_domain = normalizeEmailDomain(parsed.data.email_domain);
    }
    if (parsed.data.enforce_2fa !== undefined) {
      updateData.enforce_2fa = parsed.data.enforce_2fa;
    }

    const { data: updated, error } = await supabase
      .from("organisations")
      .update(updateData)
      .eq("id", ctx.organisationId)
      .select(ORGANISATION_ALL_COLUMNS)
      .single();

    if (error) {
      logger.error("Organisation update failed", { error: String(error) });
      return jsonError("Failed to update organisation", 500);
    }

    return jsonSuccess({ organisation: updated });
  } catch (err) {
    return handleApiError(err, "Failed to update organisation", {
      route: "PATCH /api/organisations",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/organisations");
    if (errorResponse) return errorResponse;

    const parsed = createOrganisationSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const normalizedSlug = parsed.data.slug
      ? normalizeSlug(parsed.data.slug)
      : normalizeSlug(parsed.data.name);
    if (!normalizedSlug) return jsonError("Slug must contain at least one letter or number", 422);

    const payload = {
      type: parsed.data.type,
      name: parsed.data.name.trim(),
      slug: normalizedSlug,
      approval: parsed.data.approval ?? ("pending" as const),
    };

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("organisations")
      .insert(payload)
      .select(ORGANISATION_ALL_COLUMNS)
      .single();
    if (error) {
      if (error.code === "23505") {
        return jsonError("An organisation with this slug already exists", 409);
      }
      logger.error("Organisation create failed", { error: String(error) });
      return jsonError("Failed to create organisation", 500);
    }

    return jsonSuccess({ organisation: data }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create organisation", {
      route: "POST /api/organisations",
    });
  }
}

export async function DELETE(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "super_admin")) return jsonError("Forbidden", 403);
    return jsonError(
      "Organisation deletion is disabled by design. Update approval or relationships instead; hard delete must be a deliberate manual recovery operation.",
      405,
    );
  } catch (err) {
    return handleApiError(err, "Failed to enforce organisation deletion policy", {
      route: "DELETE /api/organisations",
    });
  }
}
