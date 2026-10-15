/**
 * Normalize WhatsApp inbound replies to plain text for routing (consent, prescreen, etc.).
 * Meta quick-reply taps arrive as type "button" or "interactive", not "text".
 */

export type ReplyMessageSource = {
  type: string;
  text?: { body?: string };
  button?: { text?: string; payload?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
};

/**
 * Text body for typed messages; button/list title for taps.
 * Typed text path is unchanged from the legacy `message.type === "text"` read.
 */
export function normalizeReplyText(message: ReplyMessageSource): string {
  if (message.type === "text") {
    return message.text?.body?.trim() ?? "";
  }
  return (
    message.interactive?.button_reply?.title ??
    message.interactive?.list_reply?.title ??
    message.button?.text ??
    ""
  ).trim();
}
