/**
 * Map TigerHire job role_category to idibu sector id (best-effort defaults).
 * idibu sector ids vary by account; override via IDIBU_DEFAULT_SECTOR env if needed.
 */
const ROLE_CATEGORY_TO_IDIBU_SECTOR: Record<string, string> = {
  engineering: "1",
  technology: "1",
  software: "1",
  product: "2",
  design: "3",
  marketing: "4",
  sales: "5",
  finance: "6",
  hr: "7",
  operations: "8",
  customer_success: "9",
  data: "1",
};

export function mapRoleCategoryToIdibuSector(
  roleCategory: string | null | undefined,
  fallback: string,
): string {
  if (!roleCategory?.trim()) return fallback;
  const key = roleCategory.trim().toLowerCase().replace(/\s+/g, "_");
  return ROLE_CATEGORY_TO_IDIBU_SECTOR[key] ?? fallback;
}
