import type { JobOption, RoleOption } from "./types";

export function parseNumericChoice(text: string, max: number): number | null {
  const n = Number.parseInt(text.trim(), 10);
  if (!Number.isInteger(n) || n < 1 || n > max) return null;
  return n;
}

export function asRoleOptions(raw: unknown): RoleOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const label = typeof r.label === "string" ? r.label : "";
      const matchField =
        r.matchField === "title"
          ? "title"
          : r.matchField === "role_function"
            ? "role_function"
            : null;
      const matchValue = typeof r.matchValue === "string" ? r.matchValue : "";
      const count = typeof r.count === "number" ? r.count : Number(r.count ?? 0);
      if (!label || !matchField || !matchValue) return null;
      return { label, matchField, matchValue, count };
    })
    .filter((x): x is RoleOption => x != null);
}

export function asJobOptions(raw: unknown): JobOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      if (!x || typeof x !== "object") return null;
      const r = x as Record<string, unknown>;
      const id = typeof r.id === "string" ? r.id : "";
      const title = typeof r.title === "string" ? r.title : "";
      const location = typeof r.location === "string" ? r.location : "—";
      const roleFunction = typeof r.roleFunction === "string" ? r.roleFunction : null;
      if (!id || !title) return null;
      return { id, title, location, roleFunction };
    })
    .filter((x): x is JobOption => x != null);
}
