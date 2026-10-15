/**
 * Detect referral pattern in text: "Referring [Name] — [Role] — [City]" or "Refer [Name] — [Role] — [City]".
 */
export function parseReferralText(
  text: string,
): { candidateName: string; roleCategory: string; location: string } | null {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return null;

  const phoneJobMatch = cleaned.match(/refer(?:ring)?\s+(.+?)\s+([6-9]\d{9})\s+for\s+(.+)$/i);
  if (phoneJobMatch) {
    return {
      candidateName: phoneJobMatch[1]?.trim() ?? "",
      roleCategory: phoneJobMatch[3]?.trim() ?? "",
      location: "",
    };
  }

  const dashParts = cleaned.split(/\s*[-–—]\s*/);
  if (/^refer(?:ring)?\s+/i.test(cleaned) && dashParts.length >= 3) {
    const namePart = dashParts[0].replace(/^refer(?:ring)?\s+/i, "").trim();
    const rolePart = dashParts[1]?.trim() ?? "";
    const locationPart = dashParts.slice(2).join(" - ").trim();
    if (namePart && rolePart) {
      return {
        candidateName: namePart,
        roleCategory: rolePart,
        location: locationPart,
      };
    }
  }

  return null;
}
