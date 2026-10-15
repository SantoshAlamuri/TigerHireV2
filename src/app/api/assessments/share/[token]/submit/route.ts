import { NextRequest } from "next/server";
import {
  handleApiError,
  handleZodError,
  parseJsonBody,
  jsonError,
  jsonSuccess,
} from "@/lib/api-helpers";
import { submitAssessmentSchema } from "@/lib/validations/assessments";
import { submitAssessmentByToken } from "@/lib/services/assessment-share";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const parsedBody = await parseJsonBody(request, "POST /api/assessments/share/[token]/submit");
    if (parsedBody.errorResponse) return parsedBody.errorResponse;
    const parsed = submitAssessmentSchema.safeParse(parsedBody.body);
    if (!parsed.success) return handleZodError(parsed.error);

    const result = await submitAssessmentByToken({
      token,
      submissionText: parsed.data.submissionText,
      submissionUrl: parsed.data.submissionUrl,
      submittedVia: "web",
    });

    if (!result.ok) {
      return jsonError(result.error, result.status);
    }

    return jsonSuccess({ ok: true, assessmentId: result.assessmentId });
  } catch (err) {
    return handleApiError(err, "Failed to submit shared assessment", {
      route: "POST /api/assessments/share/[token]/submit",
    });
  }
}
