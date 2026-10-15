import { env } from "@/lib/config/env";

const ALLOWED_BUCKET = "resumes";

/**
 * Validates that a file_url points to our Supabase Storage resumes bucket.
 * Rejects other hosts, other buckets, and path traversal.
 * Use before storing or using file_url from client input.
 */
export function isValidResumeStorageUrl(fileUrl: string): boolean {
  if (!fileUrl || typeof fileUrl !== "string") return false;
  const trimmed = fileUrl.trim();
  if (!trimmed) return false;

  try {
    const u = new URL(trimmed);

    // Must be same host as our Supabase project (storage uses same host)
    const supabaseUrl = env.supabaseUrl.replace(/\/$/, "");
    const supabaseOrigin = new URL(supabaseUrl).origin;
    if (u.origin !== supabaseOrigin) return false;

    // Path must be under storage and our bucket (public or signed)
    // e.g. /storage/v1/object/public/resumes/... or /storage/v1/object/sign/resumes/...
    const path = u.pathname;
    if (path.includes("..")) return false;

    const bucketMarker = `/${ALLOWED_BUCKET}/`;
    const publicPrefix = "/storage/v1/object/public/";
    const signPrefix = "/storage/v1/object/sign/";
    const hasResumesSegment =
      path.includes(publicPrefix + ALLOWED_BUCKET + "/") ||
      path.includes(signPrefix + ALLOWED_BUCKET + "/") ||
      path.includes(bucketMarker);

    return hasResumesSegment;
  } catch {
    return false;
  }
}

/**
 * Returns an error message if file_url is invalid, or null if valid.
 */
export function validateResumeFileUrl(fileUrl: string): string | null {
  if (!isValidResumeStorageUrl(fileUrl)) {
    return "file_url must be a valid Supabase Storage URL for the resumes bucket";
  }
  return null;
}
