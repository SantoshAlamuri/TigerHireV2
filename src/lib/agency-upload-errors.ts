/**
 * Maps technical errors from agency profile upload (and related flows) to
 * user-facing messages. Used by single and bulk upload API routes.
 */
export function toUserFacingUploadError(message: string): string {
  if (
    message.includes("Could not extract text") ||
    message.includes("Unsupported file type") ||
    message.includes("Failed to extract text from PDF") ||
    message.includes("Failed to extract text from Word")
  ) {
    return "Could not read the file. Use a valid PDF or Word document with selectable text.";
  }
  if (message.includes("PDF_PARSE_ERROR:")) {
    return message.replace("PDF_PARSE_ERROR: ", "").trim();
  }
  if (message.includes("WORD_PARSE_ERROR:")) {
    return message.replace("WORD_PARSE_ERROR: ", "").trim();
  }
  if (
    message.includes("PDF appears corrupted") ||
    message.includes("image-only") ||
    message.includes("password-protected")
  ) {
    return "PDF could not be read (corrupted, image-only, or password-protected). Use a text-based PDF or re-save the file.";
  }
  if (message.includes("Object.defineProperty") || message.includes("non-object")) {
    return "File processing error: file may be corrupted or unsupported. Try a different PDF/Word file or re-save it.";
  }
  if (message.includes("no JSON") || message.includes("CV parser")) {
    return "Could not parse the CV. Ensure the file has clear text (name, skills, experience) and try again.";
  }
  if (
    message.includes("ANTHROPIC") ||
    message.includes("anthropic") ||
    message.includes("api_key") ||
    message.includes("401") ||
    message.includes("authentication")
  ) {
    return "CV parsing is not configured. Add ANTHROPIC_API_KEY to .env.local.";
  }
  if (
    message.includes("rate_limit") ||
    message.includes("overloaded") ||
    message.includes("529") ||
    message.includes("timeout")
  ) {
    return "CV parsing service is busy or timed out. Try again in a minute.";
  }
  if (
    message.includes("Supabase") ||
    message.includes("SUPABASE") ||
    message.includes("organisation_id")
  ) {
    return "Server configuration error. Check Supabase env vars.";
  }
  if (
    message.includes("Failed to save candidate") ||
    message.includes("Candidate record not found") ||
    message.includes("duplicate key") ||
    message.includes("foreign key")
  ) {
    return "Database error while saving. Try again or contact support.";
  }
  if (
    message.includes("storage") ||
    message.includes("bucket") ||
    message.includes("candidate-cvs")
  ) {
    return "File storage not configured. Ensure candidate-cvs bucket exists in Supabase.";
  }
  // Generic fallback: shorten long technical messages
  if (message.length > 120) {
    return "Upload failed. Try a different file or try again later.";
  }
  return message;
}
