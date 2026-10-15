/**
 * Maximum resumes a recruiter can attach in one bulk-upload session (UI + copy).
 * The browser chunks into {@link AGENCY_UPLOAD_CLIENT_BATCH_SIZE} per HTTP request.
 */
export const AGENCY_BULK_UPLOAD_MAX_FILES = 50;

/**
 * Files per browser → API request for bulk upload. Chunking lets the UI show progress between
 * batches and avoids one enormous multipart body timing out. API routes enforce this cap per POST.
 */
export const AGENCY_UPLOAD_CLIENT_BATCH_SIZE = 10;

/** Parallel storage+DB saves inside each bulk POST (bounded to protect Supabase). */
export const AGENCY_BULK_SAVE_CONCURRENCY = 6;
