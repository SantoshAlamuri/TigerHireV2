import { COUNTRY_CODES } from "./constants";

export function splitWhatsapp(raw: string): { code: string; local: string } {
  const value = (raw ?? "").trim();
  const matched = COUNTRY_CODES.find((opt) => value.startsWith(opt.code));
  if (matched)
    return { code: matched.code, local: value.slice(matched.code.length).replace(/\D/g, "") };
  return { code: "+91", local: value.replace(/\D/g, "") };
}

export function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
}

export async function patchJson(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  return res.ok;
}
