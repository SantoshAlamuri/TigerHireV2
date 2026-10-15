import { describe, it, expect } from "vitest";
import { toUserFacingUploadError } from "@/lib/agency-upload-errors";

describe("toUserFacingUploadError", () => {
  it("maps extract text errors to readable message", () => {
    expect(toUserFacingUploadError("Could not extract text from file")).toBe(
      "Could not read the file. Use a valid PDF or Word document with selectable text.",
    );
    expect(toUserFacingUploadError("Unsupported file type")).toBe(
      "Could not read the file. Use a valid PDF or Word document with selectable text.",
    );
  });

  it("strips PDF_PARSE_ERROR prefix", () => {
    expect(toUserFacingUploadError("PDF_PARSE_ERROR: Invalid PDF structure")).toBe(
      "Invalid PDF structure",
    );
  });

  it("strips WORD_PARSE_ERROR prefix", () => {
    expect(toUserFacingUploadError("WORD_PARSE_ERROR: Corrupt docx")).toBe("Corrupt docx");
  });

  it("maps corrupted/image-only/password PDF messages", () => {
    expect(toUserFacingUploadError("PDF appears corrupted")).toContain("corrupted");
    expect(toUserFacingUploadError("image-only PDF")).toContain("image-only");
    expect(toUserFacingUploadError("password-protected")).toContain("password-protected");
  });

  it("maps Object.defineProperty / non-object to file processing error", () => {
    expect(toUserFacingUploadError("Object.defineProperty failed")).toContain(
      "File processing error",
    );
    expect(toUserFacingUploadError("non-object")).toContain("File processing error");
  });

  it("maps no JSON / CV parser to parse resume message", () => {
    expect(toUserFacingUploadError("no JSON returned")).toContain("Could not parse the CV");
    expect(toUserFacingUploadError("CV parser failed")).toContain("Could not parse the CV");
  });

  it("maps Anthropic / api_key / 401 to config message", () => {
    expect(toUserFacingUploadError("ANTHROPIC API error")).toContain("ANTHROPIC_API_KEY");
    expect(toUserFacingUploadError("invalid_api_key")).toContain("ANTHROPIC_API_KEY");
    expect(toUserFacingUploadError("401 authentication")).toContain("ANTHROPIC_API_KEY");
  });

  it("maps rate_limit / overloaded / timeout to busy message", () => {
    expect(toUserFacingUploadError("rate_limit exceeded")).toContain("busy or timed out");
    expect(toUserFacingUploadError("overloaded")).toContain("busy or timed out");
    expect(toUserFacingUploadError("529")).toContain("busy or timed out");
    expect(toUserFacingUploadError("timeout")).toContain("busy or timed out");
  });

  it("maps Supabase / organisation_id to config error", () => {
    expect(toUserFacingUploadError("Supabase connection failed")).toContain("Supabase");
    expect(toUserFacingUploadError("SUPABASE error")).toContain("env vars");
    expect(toUserFacingUploadError("organisation_id missing")).toContain("env vars");
  });

  it("maps DB errors to database error message", () => {
    expect(toUserFacingUploadError("Failed to save candidate")).toContain("Database error");
    expect(toUserFacingUploadError("Candidate record not found")).toContain("Database error");
    expect(toUserFacingUploadError("duplicate key")).toContain("Database error");
    expect(toUserFacingUploadError("foreign key violation")).toContain("Database error");
  });

  it("maps storage/bucket/candidate-cvs to storage message", () => {
    expect(toUserFacingUploadError("storage error")).toContain("storage");
    expect(toUserFacingUploadError("bucket not found")).toContain("bucket");
    expect(toUserFacingUploadError("candidate-cvs missing")).toContain("candidate-cvs");
  });

  it("shortens messages longer than 120 chars to generic fallback", () => {
    const long =
      "Some very long technical error message that goes on and on with stack traces and internal details that we do not want to show to the user in the UI because it is too long";
    expect(toUserFacingUploadError(long)).toBe(
      "Upload failed. Try a different file or try again later.",
    );
  });

  it("returns message unchanged when short and no pattern match", () => {
    const short = "Unknown error";
    expect(toUserFacingUploadError(short)).toBe("Unknown error");
  });
});
