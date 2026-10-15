import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserStorageOrigin,
  isSupabaseStorageProxyConfigured,
  toBrowserFacingStorageUrl,
} from "@/lib/supabase/storage-public-url";

describe("storage-public-url", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("reports proxy as configured only when SUPABASE_INTERNAL_URL is set", () => {
    vi.stubEnv("SUPABASE_INTERNAL_URL", "");
    expect(isSupabaseStorageProxyConfigured()).toBe(false);

    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://abcd.supabase.co");
    expect(isSupabaseStorageProxyConfigured()).toBe(true);
  });

  it("returns null browser origin when storage proxy is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    expect(getBrowserStorageOrigin()).toBeNull();
  });

  it("uses proxied NEXT_PUBLIC_SUPABASE_URL origin when proxy is configured", () => {
    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://api.tigerhire.io");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    expect(getBrowserStorageOrigin()).toBe("https://api.tigerhire.io");
  });

  it("falls back to app URL when proxy is configured but public URL is supabase.co", () => {
    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    expect(getBrowserStorageOrigin()).toBe("https://tigerhire.io");
  });

  it("keeps raw supabase.co signed URLs when storage proxy is not configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");

    const raw = "https://abcd.supabase.co/storage/v1/object/sign/resumes/org/cv.pdf?token=abc";
    expect(toBrowserFacingStorageUrl(raw)).toBe(raw);
  });

  it("rewrites signed storage URLs when storage proxy is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcd.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    vi.stubEnv("SUPABASE_INTERNAL_URL", "https://abcd.supabase.co");

    const raw = "https://abcd.supabase.co/storage/v1/object/sign/resumes/org/cv.pdf?token=abc";
    expect(toBrowserFacingStorageUrl(raw)).toBe(
      "https://tigerhire.io/storage/v1/object/sign/resumes/org/cv.pdf?token=abc",
    );
  });

  it("leaves non-storage URLs unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://tigerhire.io");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://tigerhire.io");
    expect(toBrowserFacingStorageUrl("https://example.com/file.pdf")).toBe(
      "https://example.com/file.pdf",
    );
  });
});
