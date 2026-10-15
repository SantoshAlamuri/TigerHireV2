/**
 * Encryption utilities for job board credentials.
 * Uses AES-256-GCM for authenticated encryption.
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Get encryption key from environment or generate a default (for dev only).
 * In production, JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY must be set.
 */
function getEncryptionKey(): Buffer {
  const key = process.env.JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY is required in production");
    }
    // Dev fallback - DO NOT USE IN PRODUCTION
    return crypto.scryptSync("dev-key-tigerhire-job-boards", "salt", KEY_LENGTH);
  }
  // Key should be 64 hex characters (32 bytes)
  if (key.length !== 64) {
    throw new Error("JOB_BOARD_CREDENTIALS_ENCRYPTION_KEY must be 64 hex characters (32 bytes)");
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypt credentials JSON object to encrypted buffer.
 */
export function encryptCredentials(credentials: Record<string, unknown>): Buffer {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(credentials);
  let encrypted = cipher.update(plaintext, "utf8");
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: [iv (16 bytes)][tag (16 bytes)][encrypted data]
  return Buffer.concat([iv, tag, encrypted]);
}

/**
 * Decrypt credentials buffer to JSON object.
 */
export function decryptCredentials(encrypted: Buffer): Record<string, unknown> {
  const key = getEncryptionKey();

  // Extract IV, tag, and encrypted data
  const iv = encrypted.subarray(0, IV_LENGTH);
  const tag = encrypted.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encryptedData = encrypted.subarray(IV_LENGTH + TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return JSON.parse(decrypted.toString("utf8"));
}
