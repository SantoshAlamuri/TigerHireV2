import { createHash, randomBytes } from "node:crypto";

export function newScheduleTokenPair(): { raw: string; hash: string } {
  const raw = randomBytes(24).toString("hex");
  const hash = createHash("sha256").update(raw, "utf8").digest("hex");
  return { raw, hash };
}

export function hashScheduleToken(raw: string): string {
  return createHash("sha256").update(raw.trim(), "utf8").digest("hex");
}
