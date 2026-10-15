import { randomBytes } from "node:crypto";
import { Resolver } from "node:dns/promises";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function toBase32(input: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function generateVerificationToken(): string {
  const token = toBase32(randomBytes(20)).slice(0, 32).toLowerCase();
  return `tigerhire-verify=${token}`;
}

export async function verifyDnsTxt(domain: string, expectedToken: string): Promise<boolean> {
  const hostname = `_tigerhire-verify.${domain.trim().toLowerCase()}`;
  const resolver = new Resolver();
  // Use public resolvers to avoid stale local/system DNS cache.
  resolver.setServers(["8.8.8.8", "1.1.1.1"]);
  try {
    const records = (await Promise.race([
      resolver.resolveTxt(hostname),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("dns_timeout")), 5000);
      }),
    ])) as string[][];
    return records
      .map((entry) => entry.join("").trim())
      .some((value) => value === expectedToken.trim());
  } catch {
    return false;
  }
}
