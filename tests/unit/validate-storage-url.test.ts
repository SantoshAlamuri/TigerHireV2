import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/config/env", () => ({
  env: {
    supabaseUrl: "https://abcdefgh.supabase.co",
  },
}));

import {
  isValidResumeStorageUrl,
  validateResumeFileUrl,
} from "@/lib/security/validate-storage-url";

describe("validate-storage-url", () => {
  const validBase = "https://abcdefgh.supabase.co";

  it("rejects empty or non-string", () => {
    expect(isValidResumeStorageUrl("")).toBe(false);
    expect(isValidResumeStorageUrl("   ")).toBe(false);
    expect(isValidResumeStorageUrl(null as never)).toBe(false);
    expect(isValidResumeStorageUrl(undefined as never)).toBe(false);
  });

  it("rejects wrong origin", () => {
    expect(
      isValidResumeStorageUrl("https://evil.com/storage/v1/object/public/resumes/foo.pdf"),
    ).toBe(false);
    expect(
      isValidResumeStorageUrl("https://other.supabase.co/storage/v1/object/public/resumes/foo.pdf"),
    ).toBe(false);
  });

  it("rejects path traversal", () => {
    expect(
      isValidResumeStorageUrl(`${validBase}/storage/v1/object/public/resumes/../other/file.pdf`),
    ).toBe(false);
  });

  it("accepts valid public resumes URL", () => {
    expect(
      isValidResumeStorageUrl(`${validBase}/storage/v1/object/public/resumes/tenant-1/abc.pdf`),
    ).toBe(true);
    expect(isValidResumeStorageUrl(`${validBase}/storage/v1/object/public/resumes/file.pdf`)).toBe(
      true,
    );
  });

  it("accepts valid signed resumes URL", () => {
    expect(
      isValidResumeStorageUrl(
        `${validBase}/storage/v1/object/sign/resumes/tenant-1/abc.pdf?token=...`,
      ),
    ).toBe(true);
  });

  it("rejects other buckets", () => {
    expect(
      isValidResumeStorageUrl(`${validBase}/storage/v1/object/public/other-bucket/file.pdf`),
    ).toBe(false);
  });

  it("validateResumeFileUrl returns null for valid URL", () => {
    expect(validateResumeFileUrl(`${validBase}/storage/v1/object/public/resumes/x.pdf`)).toBe(null);
  });

  it("validateResumeFileUrl returns message for invalid URL", () => {
    expect(validateResumeFileUrl("https://evil.com/x")).toContain("file_url must be");
  });
});
