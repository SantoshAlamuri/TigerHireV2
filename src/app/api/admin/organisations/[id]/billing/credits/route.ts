import { NextRequest } from "next/server";
import {
  parseJsonBody,
  handleZodError,
  jsonError,
  jsonSuccess,
  handleApiError,
} from "@/lib/api-helpers";
import { validateOrigin } from "@/lib/security/csrf";
import { requirePlatformAdmin } from "@/lib/security/platform-admin";
import { adjustOrganisationCredits, getManualBillingState } from "@/lib/services/manual-billing";
import { adminOrgCreditMutationSchema } from "@/lib/validations/organisations";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const csrf = validateOrigin(request);
  if (csrf) return csrf;
  try {
    const { id } = await params;
    const auth = await requirePlatformAdmin(request);
    if (auth.error) return auth.error;

    const parsedBody = await parseJsonBody(
      request,
      "POST /api/admin/organisations/[id]/billing/credits",
    );
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = adminOrgCreditMutationSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const payload = parsed.data;
    const result = await adjustOrganisationCredits({
      organisationId: id,
      creditType: payload.creditType,
      delta: payload.delta,
      entryType: payload.entryType,
      reason: payload.reason,
      createdBy: auth.context.userId,
      referenceType: payload.referenceType ?? null,
      referenceId: payload.referenceId ?? null,
    });
    const state = await getManualBillingState(id);
    return jsonSuccess({
      balanceAfter: result.balanceAfter,
      wallet: state.wallet,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to mutate credits";
    if (message.startsWith("Insufficient")) return jsonError(message, 409);
    return handleApiError(err, "Failed to mutate organisation credits", {
      route: "POST /api/admin/organisations/[id]/billing/credits",
    });
  }
}
