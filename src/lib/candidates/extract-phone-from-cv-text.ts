import { normalizePhoneForCandidate } from "@/lib/agents/candidate-dedup";

/**
 * Best-effort phone extraction from stored CV plain text when `candidates.phone` is empty.
 * Prefer labeled lines (Phone:, Mobile:, etc.) to avoid matching dates or IDs.
 */
export function extractPhoneFromCvText(text: string): string | null {
  const t = text.slice(0, 60_000);
  const labeled =
    /(?:^|[\s(,])(?:phone|mobile|cell|whatsapp|tel\.?|m\/s|contact)\s*[:\-]?\s*(\+?[\d\s().\-]{10,26})/gim;
  let m: RegExpExecArray | null;
  while ((m = labeled.exec(t)) !== null) {
    const n = normalizePhoneForCandidate(m[1]);
    if (n && n.length >= 10 && n.length <= 15) return n;
  }

  // Indian-style +91 … (common in this product’s market)
  const in91 = /\+?\s*91[\s.\-]?[6-9]\d{9}\b/g.exec(t);
  if (in91) {
    const n = normalizePhoneForCandidate(in91[0]);
    if (n && n.length >= 10 && n.length <= 15) return n;
  }

  return null;
}
