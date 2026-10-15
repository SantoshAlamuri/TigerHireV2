import crypto from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const AES_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const FALLBACK_PREFIX = "enc:";
const LEGACY_JOB_BOARD_PREFIX = "legacy_job_board:";

function getFallbackKey(): Buffer {
  const rawKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (!rawKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("INTEGRATION_ENCRYPTION_KEY is required in production");
    }
    return crypto.createHash("sha256").update("tigerhire-settings-dev-key").digest();
  }

  if (!/^[a-fA-F0-9]{64}$/.test(rawKey)) {
    throw new Error("INTEGRATION_ENCRYPTION_KEY must be a 32-byte hex string (64 chars)");
  }
  return Buffer.from(rawKey, "hex");
}

function encryptFallbackValue(value: string): string {
  const key = getFallbackKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${FALLBACK_PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

function decryptFallbackValue(encoded: string): string {
  if (!encoded.startsWith(FALLBACK_PREFIX)) {
    throw new Error("Secret reference is not an encrypted fallback payload");
  }

  const payload = Buffer.from(encoded.slice(FALLBACK_PREFIX.length), "base64");
  const iv = payload.subarray(0, IV_LENGTH);
  const tag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, getFallbackKey(), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Store secret in Supabase Vault when available, fallback to encrypted payload.
 */
export async function storeSecret(
  organizationId: string,
  provider: string,
  key: string,
  value: string,
): Promise<string> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("vault_store_secret", {
    p_name: `${organizationId}:${provider}:${key}`,
    p_secret: value,
  });

  if (!error && data) {
    return String(data);
  }

  return encryptFallbackValue(value);
}

export async function retrieveSecret(secretRef: string): Promise<string> {
  if (secretRef.startsWith(FALLBACK_PREFIX)) {
    return decryptFallbackValue(secretRef);
  }
  if (secretRef.startsWith(LEGACY_JOB_BOARD_PREFIX)) {
    return secretRef;
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("vault_read_secret", {
    p_secret_id: secretRef,
  });
  if (error) throw error;
  return String(data ?? "");
}

export async function deleteSecret(secretRef: string): Promise<void> {
  if (secretRef.startsWith(FALLBACK_PREFIX) || secretRef.startsWith(LEGACY_JOB_BOARD_PREFIX))
    return;

  const admin = createSupabaseAdmin();
  await admin.rpc("vault_delete_secret", {
    p_secret_id: secretRef,
  });
}

export function encryptIntegrationToken(value: string): string {
  return encryptFallbackValue(value);
}

export function decryptIntegrationToken(value: string): string {
  return decryptFallbackValue(value);
}
