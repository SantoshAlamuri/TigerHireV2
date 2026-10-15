import { NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getAuthContext,
  requireAuth,
  jsonError,
  jsonSuccess,
  handleApiError,
  handleZodError,
  parseJsonBody,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import type { OfferCtcFormula } from "@/lib/offers/offer-ctc-calculator";

type OfferLetterFlow = {
  steps: string[];
  ctcCalculators: Array<{
    key: string;
    name: string;
    components: Array<{
      label: string;
      annual: number | null;
      formula: OfferCtcFormula | null;
    }>;
  }>;
  defaultCalculatorKey: string;
};

const defaultFlow: OfferLetterFlow = {
  steps: ["Select candidate", "Compute CTC", "Fill letter details", "Create offer draft"],
  ctcCalculators: [
    {
      key: "default",
      name: "Standard CTC",
      components: [
        { label: "Base / fixed pay", annual: null as number | null, formula: null },
        {
          label: "HRA",
          annual: null as number | null,
          formula: { basis: "base" as const, percent: 40 },
        },
        {
          label: "Employer PF",
          annual: null as number | null,
          formula: { basis: "base" as const, percent: 12 },
        },
        { label: "Allowances & cash benefits", annual: null as number | null, formula: null },
      ],
    },
  ],
  defaultCalculatorKey: "default",
};

const stepSchema = z.string().trim().min(2).max(80);
const ctcComponentSchema = z
  .object({
    label: z.string().trim().min(2).max(80),
    annual: z.number().nonnegative().nullable().optional(),
    formula: z
      .object({
        basis: z.enum(["base", "subtotal"]),
        percent: z.number().min(0).max(100),
      })
      .strict()
      .nullable()
      .optional(),
  })
  .strict();
const calculatorSchema = z
  .object({
    key: z.string().trim().min(2).max(60),
    name: z.string().trim().min(2).max(80),
    components: z.array(ctcComponentSchema).min(1).max(12),
  })
  .strict();
const updateSchema = z
  .object({
    steps: z.array(stepSchema).min(3).max(8),
    ctcCalculators: z.array(calculatorSchema).min(1).max(8),
    defaultCalculatorKey: z.string().trim().min(2).max(60).optional(),
  })
  .strict();

type FlowPayload = z.infer<typeof updateSchema>;

function canRead(role: string): boolean {
  return (
    role === "super_admin" ||
    role === "leadership" ||
    role === "recruiter" ||
    role === "hiring_manager"
  );
}

function canWrite(ctx: { role: string; isOrgAdmin?: boolean }): boolean {
  if (ctx.role === "super_admin") return true;
  return Boolean(ctx.isOrgAdmin);
}

function sanitizeFlowPayload(input: unknown): OfferLetterFlow {
  // Backward compatibility for old payload shape.
  const legacy = z
    .object({
      steps: z.array(stepSchema).min(3).max(8),
      ctcComponents: z.array(ctcComponentSchema).min(1).max(12),
    })
    .strict()
    .safeParse(input);
  if (legacy.success) {
    return {
      steps: legacy.data.steps,
      ctcCalculators: [
        {
          key: "default",
          name: "Standard CTC",
          components: legacy.data.ctcComponents.map((row) => ({
            label: row.label,
            annual: row.annual ?? null,
            formula: row.formula ?? null,
          })),
        },
      ],
      defaultCalculatorKey: "default",
    };
  }

  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return defaultFlow;
  const calculators = parsed.data.ctcCalculators.map((calc, idx) => ({
    key: calc.key || `calc_${idx + 1}`,
    name: calc.name,
    components: calc.components.map((row) => ({
      label: row.label,
      annual: row.annual ?? null,
      formula: row.formula ?? null,
    })),
  }));
  const defaultCalculatorKey =
    parsed.data.defaultCalculatorKey &&
    calculators.some((c) => c.key === parsed.data.defaultCalculatorKey)
      ? parsed.data.defaultCalculatorKey
      : (calculators[0]?.key ?? "default");
  return {
    steps: parsed.data.steps,
    ctcCalculators: calculators.length > 0 ? calculators : defaultFlow.ctcCalculators,
    defaultCalculatorKey,
  };
}

export async function GET() {
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!canRead(ctx.role)) return jsonError("Forbidden", 403);

    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();

    if (error) throw error;

    const flow = sanitizeFlowPayload(
      (data?.permissions as Record<string, unknown> | null)?.offerLetterFlow,
    );
    return jsonSuccess({ flow, canEdit: canWrite(ctx) });
  } catch (err) {
    return handleApiError(err, "Failed to load offer letter flow settings", {
      route: "GET /api/settings/offer-letter-flow",
    });
  }
}

export async function POST(request: NextRequest) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const ctx = await getAuthContext();
    if (!requireAuth(ctx)) return jsonError("Unauthorized", 401);
    if (!ctx.organisationId) return jsonError("No organisation context", 400);
    if (!canWrite(ctx)) return jsonError("Forbidden", 403);

    const { body, errorResponse } = await parseJsonBody(
      request,
      "POST /api/settings/offer-letter-flow",
    );
    if (errorResponse) return errorResponse;
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return handleZodError(parsed.error);

    const flow: FlowPayload = parsed.data;
    const admin = createSupabaseAdmin();

    const { data: row, error: readErr } = await admin
      .from("role_permission_settings")
      .select("permissions")
      .eq("organisation_id", ctx.organisationId)
      .maybeSingle();
    if (readErr) throw readErr;

    const existingPermissions = (row?.permissions as Record<string, unknown> | undefined) ?? {};

    const nextPermissions = {
      ...existingPermissions,
      offerLetterFlow: {
        steps: flow.steps,
        ctcCalculators: flow.ctcCalculators.map((calc) => ({
          key: calc.key,
          name: calc.name,
          components: calc.components.map((item) => ({
            label: item.label,
            annual: item.annual ?? null,
            formula: item.formula ?? null,
          })),
        })),
        defaultCalculatorKey: flow.defaultCalculatorKey,
      },
    };

    const { error: writeErr } = await admin.from("role_permission_settings").upsert(
      {
        organisation_id: ctx.organisationId,
        permissions: nextPermissions,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "organisation_id" },
    );
    if (writeErr) throw writeErr;

    return jsonSuccess({
      flow: sanitizeFlowPayload(nextPermissions.offerLetterFlow),
      canEdit: true,
    });
  } catch (err) {
    return handleApiError(err, "Failed to save offer letter flow settings", {
      route: "POST /api/settings/offer-letter-flow",
    });
  }
}
