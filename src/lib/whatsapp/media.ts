import { env } from "@/lib/config/env";

const META_GRAPH_VERSION = "v22.0";

/** Download inbound WhatsApp document media (e.g. CV PDF) by Meta media id. */
export async function downloadWhatsAppMedia(mediaId: string): Promise<Buffer> {
  const token = env.whatsappAccessToken.trim();
  if (!token) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN for Meta media download.");
  }

  const metaId = mediaId.trim();
  if (!metaId) {
    throw new Error("WhatsApp media id is required.");
  }

  const metaRes = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${encodeURIComponent(metaId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const metaPayload = (await metaRes.json().catch(() => ({}))) as {
    url?: string;
    error?: { message?: string };
  };
  if (!metaRes.ok || !metaPayload.url) {
    const message = metaPayload.error?.message ?? JSON.stringify(metaPayload);
    throw new Error(`WhatsApp media metadata fetch failed: ${metaRes.status} ${message}`);
  }

  const fileRes = await fetch(metaPayload.url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!fileRes.ok) {
    const text = await fileRes.text();
    throw new Error(`WhatsApp media download failed: ${fileRes.status} ${text}`);
  }

  const arrayBuffer = await fileRes.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
