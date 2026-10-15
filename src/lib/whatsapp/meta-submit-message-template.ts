import { env } from "@/lib/config/env";

const GRAPH = "v22.0";

export type MetaTemplateComponent = {
  type: string;
  text?: string;
  example?: { body_text?: string[][] };
  buttons?: unknown[];
};

export type MetaTemplateDefinition = {
  name: string;
  category: "UTILITY" | "MARKETING" | "AUTHENTICATION";
  language: string;
  components: MetaTemplateComponent[];
};

export type MetaSubmitTemplateResult =
  | {
      ok: true;
      templateName: string;
      metaStatus: string;
      metaTemplateId?: number;
      alreadyExists: boolean;
    }
  | { ok: false; templateName: string; error: string; httpStatus?: number };

/**
 * Submit a message template to Meta WhatsApp Business API (WABA).
 * Approval/rejection arrives via `message_template_status_update` webhook.
 */
export async function submitMessageTemplateToMeta(
  definition: MetaTemplateDefinition,
): Promise<MetaSubmitTemplateResult> {
  const token = env.whatsappAccessToken?.trim();
  const waba = env.metaWabaId?.trim();
  if (!token || !waba) {
    return {
      ok: false,
      templateName: definition.name,
      error: "Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_WABA_ID",
    };
  }

  const url = `https://graph.facebook.com/${GRAPH}/${waba}/message_templates`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(definition),
  });

  const data = (await res.json().catch(() => ({}))) as {
    id?: number;
    status?: string;
    error?: { message?: string; code?: number; error_subcode?: number };
  };

  if (res.ok) {
    return {
      ok: true,
      templateName: definition.name,
      metaStatus: data.status ?? "PENDING",
      metaTemplateId: data.id,
      alreadyExists: false,
    };
  }

  const msg = data.error?.message ?? "Meta API error";
  const code = data.error?.code;
  const sub = data.error?.error_subcode;
  if (code === 192 || sub === 2388024 || /already exists/i.test(msg)) {
    return {
      ok: true,
      templateName: definition.name,
      metaStatus: "EXISTS_ON_WABA",
      alreadyExists: true,
    };
  }

  return {
    ok: false,
    templateName: definition.name,
    error: msg,
    httpStatus: res.status,
  };
}

/** Plan pilot: screening invite after recruiter moves candidate to phone_screen. */
export const TH_SCREENING_INVITE_TEMPLATE: MetaTemplateDefinition = {
  name: "th_screening_invite",
  category: "UTILITY",
  language: "en",
  components: [
    {
      type: "BODY",
      text: "Hi {{1}}, {{2}} would like to ask a few quick screening questions to match you with the right role. Reply YES to start or NO to skip.",
      example: {
        body_text: [["Priya", "Acme Corp"]],
      },
    },
  ],
};
