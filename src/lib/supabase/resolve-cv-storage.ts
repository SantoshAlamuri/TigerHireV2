/** Buckets that store candidate CV / resume files. */
export const CV_STORAGE_BUCKETS = ["candidate-cvs", "resumes"] as const;

export type CvStorageBucket = (typeof CV_STORAGE_BUCKETS)[number];

const STORAGE_OBJECT_PATH_RE =
  /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/]+)\/(.+)$/i;

/**
 * Extract object path from a Supabase storage URL for a given bucket.
 * Handles public, signed, and authenticated URLs on any host (supabase.co or proxied app domain).
 */
export function pathFromStorageUrl(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const i = url.indexOf(marker);
  if (i !== -1) {
    const after = url.slice(i + marker.length);
    const path = after.split("?")[0]?.trim();
    if (path) return path;
  }

  const match = url.trim().match(STORAGE_OBJECT_PATH_RE);
  if (match?.[1] === bucket && match[2]) {
    return match[2].split("?")[0]?.trim() || null;
  }

  return null;
}

function resolveBareStoragePath(value: string): { bucket: CvStorageBucket; path: string } | null {
  const trimmed = value.trim().split("?")[0]?.trim();
  if (!trimmed || /^https?:\/\//i.test(trimmed)) return null;

  if (trimmed.startsWith("cvs/")) {
    return { bucket: "candidate-cvs", path: trimmed };
  }

  if (/^[0-9a-f-]{36}\/.+/i.test(trimmed)) {
    return { bucket: "resumes", path: trimmed };
  }

  return null;
}

function bucketForStoragePath(storagePath: string): CvStorageBucket {
  return storagePath.startsWith("cvs/") ? "candidate-cvs" : "resumes";
}

/**
 * Resolve bucket + object path for a stored CV reference.
 * Prefers `file_url` when present so bucket detection stays correct for agency/public uploads.
 */
export function resolveCvStorageObject(params: {
  fileUrl?: string | null;
  storagePath?: string | null;
}): { bucket: CvStorageBucket; path: string } | null {
  const fileUrl = params.fileUrl?.trim();
  if (fileUrl) {
    for (const bucket of CV_STORAGE_BUCKETS) {
      const path = pathFromStorageUrl(fileUrl, bucket);
      if (path) return { bucket, path };
    }
    const bareFromUrl = resolveBareStoragePath(fileUrl);
    if (bareFromUrl) return bareFromUrl;
  }

  const storagePath = params.storagePath?.trim();
  if (storagePath) {
    return { bucket: bucketForStoragePath(storagePath), path: storagePath };
  }

  return null;
}
