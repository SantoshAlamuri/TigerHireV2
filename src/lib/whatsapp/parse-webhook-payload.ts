/**
 * Normalize Meta Cloud API webhook bodies to the flat message shape used by
 * `handleInboundMessage`, and extract Lane A context from buttons.
 */

export type ExtractedInboundContext = {
  job_id?: string;
  campaign_id?: string;
};

/** Single message after normalization (subset of fields we use). */
export type NormalizedWhatsAppMessage = {
  id?: string;
  from: string;
  type: string;
  text?: { body?: string };
  document?: {
    id?: string;
    filename?: string;
    mime_type?: string;
    link?: string;
    url?: string;
  };
  image?: { id: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  context?: { id?: string; from?: string };
};

export type NormalizedWebhookPayload = {
  messages?: NormalizedWhatsAppMessage[];
  contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
  extracted?: ExtractedInboundContext;
};

/** Normalize 32-char hex to hyphenated UUID for Postgres/Supabase lookups. */
function normalizeUuidToken(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/-/g, "");
  if (/^[a-f0-9]{32}$/.test(s)) {
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
  }
  return raw.trim();
}

function parseJobOrCampaignPayload(raw: string | undefined): ExtractedInboundContext {
  const out: ExtractedInboundContext = {};
  if (!raw?.trim()) return out;
  const t = raw.trim();
  const job36 =
    t.match(/job_id:\s*([a-f0-9-]{36})/i)?.[1] ?? t.match(/^job_id=([a-f0-9-]{36})$/i)?.[1];
  const job32 =
    !job36 &&
    (t.match(/job_id:\s*([a-f0-9]{32})/i)?.[1] ?? t.match(/^job_id=([a-f0-9]{32})$/i)?.[1]);
  if (job36) out.job_id = job36.toLowerCase();
  else if (job32) out.job_id = normalizeUuidToken(job32);

  const camp36 =
    t.match(/campaign_id:\s*([a-f0-9-]{36})/i)?.[1] ??
    t.match(/^campaign_id=([a-f0-9-]{36})$/i)?.[1];
  const camp32 =
    !camp36 &&
    (t.match(/campaign_id:\s*([a-f0-9]{32})/i)?.[1] ??
      t.match(/^campaign_id=([a-f0-9]{32})$/i)?.[1]);
  if (camp36) out.campaign_id = camp36.toLowerCase();
  else if (camp32) out.campaign_id = normalizeUuidToken(camp32);
  return out;
}

export function extractInboundContextFromWhatsAppMessage(
  msg: NormalizedWhatsAppMessage,
): ExtractedInboundContext {
  const merged: ExtractedInboundContext = {};
  if (msg.button?.payload) Object.assign(merged, parseJobOrCampaignPayload(msg.button.payload));
  const ir = msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id;
  if (ir) Object.assign(merged, parseJobOrCampaignPayload(ir));
  if (msg.context?.id && !merged.job_id) {
    Object.assign(merged, parseJobOrCampaignPayload(msg.context.id));
  }
  return merged;
}

/** Accepts Meta `{ entry: [{ changes: [{ value: { messages: [...] } }] }] }` payloads. */
export function normalizeWhatsAppWebhookBody(body: unknown): NormalizedWebhookPayload {
  if (!body || typeof body !== "object") {
    return {};
  }

  const b = body as Record<string, unknown>;

  const entry = b.entry as Array<Record<string, unknown>> | undefined;
  const first = entry?.[0];
  const changes = first?.changes as Array<Record<string, unknown>> | undefined;
  const value = changes?.[0]?.value as Record<string, unknown> | undefined;
  const rawMessages = value?.messages as NormalizedWhatsAppMessage[] | undefined;
  if (rawMessages?.length) {
    const extracted = extractInboundContextFromWhatsAppMessage(rawMessages[0]);
    return {
      messages: rawMessages,
      contacts: value?.contacts as NormalizedWebhookPayload["contacts"],
      extracted,
    };
  }

  return {};
}
