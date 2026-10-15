import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  parseJsonBody,
  handleZodError,
} from "@/lib/api-helpers";
import { hasAnyEnterpriseRole } from "@/lib/security/enterprise-roles";
import { validateOrigin } from "@/lib/security/csrf";
import { z } from "zod";
import {
  ensureDefaultOfferPdfTemplate,
  getLatestTemplateVersion,
} from "@/lib/offers/offer-pdf-template";
import {
  isMissingOfferTemplateCustomMergeColumn,
  parseCustomMergeFieldDefs,
} from "@/lib/offers/offer-custom-merge-fields";
import {
  isMissingOfferTemplateSelectionRulesColumn,
  parseOfferTemplateSelectionRules,
} from "@/lib/offers/offer-template-selection-rules";

const createSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    bodyText: z.string().min(20).max(50_000),
    setDefault: z.boolean().optional(),
  })
  .strict();
const listTemplatesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

/**
 * GET /api/offer-pdf-templates — list org templates with latest body snippet.
 */
export async function GET(request: NextRequest) {
  try {
    const paginationParsed = listTemplatesQuerySchema.safeParse({
      limit: request.nextUrl.searchParams.get("limit") ?? undefined,
      offset: request.nextUrl.searchParams.get("offset") ?? undefined,
    });
    if (!paginationParsed.success) return handleZodError(paginationParsed.error);
    const { limit, offset } = paginationParsed.data;
    const rangeEnd = offset + limit;

    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "finance", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    await ensureDefaultOfferPdfTemplate(admin, ctx.organisationId, ctx.userId);

    let templates: Array<Record<string, unknown>> | null = null;
    let error: { message?: string } | null = null;
    const fullTemplates = await supabase
      .from("offer_pdf_templates")
      .select(
        "id, name, is_default, is_archived, created_at, updated_at, custom_merge_field_defs, selection_rules",
      )
      .eq("organisation_id", ctx.organisationId)
      .eq("is_archived", false)
      .order("is_default", { ascending: false })
      .order("name", { ascending: true })
      .range(offset, rangeEnd);
    templates = (fullTemplates.data as Array<Record<string, unknown>> | null) ?? null;
    error = fullTemplates.error;

    if (
      error &&
      (isMissingOfferTemplateCustomMergeColumn(error) ||
        isMissingOfferTemplateSelectionRulesColumn(error))
    ) {
      const legacyTemplates = await supabase
        .from("offer_pdf_templates")
        .select("id, name, is_default, is_archived, created_at, updated_at")
        .eq("organisation_id", ctx.organisationId)
        .eq("is_archived", false)
        .order("is_default", { ascending: false })
        .order("name", { ascending: true })
        .range(offset, rangeEnd);
      error = legacyTemplates.error;
      templates = legacyTemplates.data
        ? (legacyTemplates.data as Array<Record<string, unknown>>).map((row) => ({
            ...row,
            custom_merge_field_defs: null as null,
            selection_rules: null as null,
          }))
        : null;
    }

    if (error) return jsonError("Failed to load templates", 500);

    const rows = templates ?? [];
    const hasMore = rows.length > limit;
    const out = [];
    for (const t of rows.slice(0, limit)) {
      const latest = await getLatestTemplateVersion(admin, t.id as string);
      out.push({
        id: t.id,
        name: t.name,
        is_default: t.is_default,
        created_at: t.created_at,
        updated_at: t.updated_at,
        latestVersionNumber: latest?.versionNumber ?? 0,
        bodyPreview: latest ? latest.bodyText.slice(0, 280) : "",
        bodyText: latest?.bodyText ?? "",
        customMergeFieldDefs: parseCustomMergeFieldDefs(
          (t as { custom_merge_field_defs?: unknown }).custom_merge_field_defs,
        ),
        selectionRules: parseOfferTemplateSelectionRules(
          (t as { selection_rules?: unknown }).selection_rules,
        ),
      });
    }

    return jsonSuccess({
      templates: out,
      pagination: { limit, offset, hasMore },
    });
  } catch (err) {
    return handleApiError(err, "Failed to list offer PDF templates", {
      route: "GET /api/offer-pdf-templates",
    });
  }
}

/**
 * POST /api/offer-pdf-templates — create a new template (version 1).
 */
export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);

    const supabase = await createSupabaseServerClient();
    const allowed = await hasAnyEnterpriseRole(
      ctx.userId,
      ["leadership", "recruiter", "hiring_manager", "super_admin"],
      supabase,
    );
    if (!allowed) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(request, "POST /api/offer-pdf-templates");
    if (errorResponse) return errorResponse;
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const name = parsed.data.name ?? "Custom offer letter";
    const setDefault = parsed.data.setDefault === true;

    if (setDefault) {
      await supabase
        .from("offer_pdf_templates")
        .update({ is_default: false })
        .eq("organisation_id", ctx.organisationId)
        .eq("is_archived", false);
    }

    const { data: row, error: insErr } = await supabase
      .from("offer_pdf_templates")
      .insert({
        organisation_id: ctx.organisationId,
        name,
        is_default: setDefault,
        is_archived: false,
        created_by: ctx.userId,
      })
      .select("id")
      .single();

    if (insErr || !row?.id) return jsonError(insErr?.message ?? "Failed to create template", 500);

    const tid = row.id as string;
    const { error: vErr } = await supabase.from("offer_pdf_template_versions").insert({
      template_id: tid,
      version_number: 1,
      body_text: parsed.data.bodyText,
      created_by: ctx.userId,
    });

    if (vErr) return jsonError(vErr.message, 500);

    if (!setDefault) {
      await ensureDefaultOfferPdfTemplate(createSupabaseAdmin(), ctx.organisationId, ctx.userId);
    }

    return jsonSuccess({ templateId: tid, versionNumber: 1 }, 201);
  } catch (err) {
    return handleApiError(err, "Failed to create offer PDF template", {
      route: "POST /api/offer-pdf-templates",
    });
  }
}
