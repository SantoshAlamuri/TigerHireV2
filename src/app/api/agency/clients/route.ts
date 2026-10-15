import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { OrganisationRepository } from "@/lib/repositories/OrganisationRepository";
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
import { agencyClientCreateSchema } from "@/lib/validations/organisations";

/** Normalize slug: lowercase, only a-z0-9 and single hyphens. */
function normalizeSlug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

const ORGANISATION_ALL_COLUMNS =
  "id, type, name, slug, approval, company_plan, stripe_customer_id, created_at, updated_at, email_domain";

/**
 * GET /api/agency/clients
 * Returns the list of client organisations for the current agency (same as agency branch of GET /api/organisations).
 */
export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const supabase = await createSupabaseServerClient();
    const { data: links, error: linkError } = await supabase
      .from("agency_clients")
      .select("client_organisation_id, status, is_active")
      .eq("agency_organisation_id", ctx.organisationId);

    if (linkError) {
      return jsonSuccess({ organisations: [] });
    }
    type LinkRow = { client_organisation_id: string; status: string; is_active: boolean };
    const linkRows = (links ?? []) as LinkRow[];
    const clientIds = linkRows.map((r) => r.client_organisation_id);
    if (clientIds.length === 0) {
      return jsonSuccess({ organisations: [], pendingRequests: [] });
    }

    const { data: clientOrgs, error: orgError } = await supabase
      .from("organisations")
      .select(ORGANISATION_ALL_COLUMNS)
      .in("id", clientIds)
      .order("name");

    if (orgError) {
      return jsonSuccess({ organisations: [], pendingRequests: [] });
    }

    // Only live links are clients. A request the company has not approved yet is
    // reported separately so the agency sees why the roles are not there — the
    // alternative is a client that silently shows nothing.
    const statusByOrg = new Map(linkRows.map((r) => [r.client_organisation_id, r]));
    const isLive = (orgId: string) => {
      const link = statusByOrg.get(orgId);
      return link?.status === "active" && link.is_active === true;
    };
    const orgs = clientOrgs ?? [];

    return jsonSuccess({
      organisations: orgs.filter((o) => isLive(o.id)),
      pendingRequests: orgs
        .filter((o) => statusByOrg.get(o.id)?.status === "pending")
        .map((o) => ({ id: o.id, name: o.name, slug: o.slug })),
    });
  } catch (err) {
    return handleApiError(err, "Failed to fetch agency clients", {
      route: "GET /api/agency/clients",
    });
  }
}

/**
 * POST /api/agency/clients
 * Agency adds a client by slug. If no company exists with that slug, a new company
 * organisation is created (so clients do not need to be registered on TigerHire).
 * Body: { slug: string, name?: string }. name is optional display name when creating new.
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!hasRole(ctx, "agency")) return jsonError("Forbidden", 403);
    if (!ctx.organisationId) return jsonError("No organisation associated with your account", 400);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/agency/clients");
    if (errorResponse) return errorResponse;

    const parsed = agencyClientCreateSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);
    const slugRaw = parsed.data.slug;

    const slug = normalizeSlug(slugRaw);
    if (!slug) return jsonError("slug must contain at least one letter or number", 400);

    const name = parsed.data.name && parsed.data.name.trim() ? parsed.data.name.trim() : slug;

    const supabase = await createSupabaseServerClient();
    let clientOrg = await OrganisationRepository.getBySlug(supabase, slug);

    if (!clientOrg) {
      const admin = createSupabaseAdmin();
      const { data: newOrg, error: createError } = await admin
        .from("organisations")
        .insert({
          type: "company",
          name,
          slug,
          approval: "approved",
        })
        .select(ORGANISATION_ALL_COLUMNS)
        .single();

      if (createError) {
        if (createError.code === "23505") {
          const { data: existing } = await admin
            .from("organisations")
            .select(ORGANISATION_ALL_COLUMNS)
            .eq("slug", slug)
            .single();
          if (!existing) return jsonError("Slug is taken; try another", 409);
          clientOrg = existing;
        } else {
          return jsonError("Failed to create client", 500);
        }
      } else {
        clientOrg = newOrg;
      }
    }

    if (!clientOrg) {
      return jsonError("Failed to resolve client organisation", 500);
    }

    if (clientOrg.id === ctx.organisationId) {
      return jsonError("You cannot add your own organisation as a client", 400);
    }

    // An agency raises a REQUEST; the company grants the access. `status` is
    // pinned to 'pending' by the RLS INSERT policy too, so this is not the only
    // thing standing between an agency and another company's pipeline.
    const { error } = await supabase.from("agency_clients").insert({
      agency_organisation_id: ctx.organisationId,
      client_organisation_id: clientOrg.id,
      status: "pending",
      initiated_by: "agency",
    });

    if (error) {
      if (error.code === "23505")
        return jsonError("You have already requested access to this company", 409);
      return jsonError("Failed to request access", 500);
    }

    return jsonSuccess(
      {
        organisation: clientOrg,
        status: "pending",
        message: `Request sent. ${clientOrg.name} sees their roles and candidates only after they approve it.`,
      },
      201,
    );
  } catch (err) {
    return handleApiError(err, "Failed to add client", {
      route: "POST /api/agency/clients",
    });
  }
}
