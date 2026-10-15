import { NextRequest, NextResponse } from "next/server";
import { parseJsonBody } from "@/lib/api-helpers";
import {
  sendWhatsAppMessage,
  sendSourcingCampaign,
  sendReferralDrive,
  sendReengagementTemplate,
} from "@/lib/services/whatsapp";

/**
 * POST /api/test-whatsapp
 * Quick test endpoint for WhatsApp template sends. DEV ONLY.
 *
 * Body: { phone: string, template: "sourcing" | "referral_drive" | "reengagement" | "session" }
 *
 * DELETE THIS ROUTE BEFORE PRODUCTION.
 */
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const parsedBody = await parseJsonBody(request, "POST /api/test-whatsapp");
  if (parsedBody.errorResponse) return parsedBody.errorResponse;
  const body = parsedBody.body;
  const { phone, template } = body as { phone?: string; template?: string };

  if (!phone) {
    return NextResponse.json({ error: "phone is required" }, { status: 400 });
  }

  let result;

  switch (template) {
    case "sourcing":
      result = await sendSourcingCampaign({
        phone,
        candidateName: "Test User",
        companyName: "Acme Corp",
        jobTitle: "Senior Engineer",
        city: "Bangalore",
        ctcRange: "25-35 LPA",
      });
      break;

    case "referral_drive":
      result = await sendReferralDrive({
        phone,
        employeeName: "Test Employee",
        companyName: "Acme Corp",
        jobTitle: "Product Manager",
        referralLink: "https://tigerhire.io/refer/test123",
      });
      break;

    case "reengagement":
      result = await sendReengagementTemplate({
        phone,
        candidateName: "Test User",
        newRoleCount: 5,
      });
      break;

    case "session":
      result = await sendWhatsAppMessage(phone, "This is a test session message from TigerHire.");
      break;

    default:
      return NextResponse.json(
        {
          error: "template must be one of: sourcing, referral_drive, reengagement, session",
        },
        { status: 400 },
      );
  }

  return NextResponse.json({ template, phone, result });
}
