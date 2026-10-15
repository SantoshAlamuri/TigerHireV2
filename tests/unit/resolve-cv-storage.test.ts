import { describe, expect, it } from "vitest";
import { pathFromStorageUrl, resolveCvStorageObject } from "@/lib/supabase/resolve-cv-storage";

describe("resolve-cv-storage", () => {
  it("parses candidate-cvs signed URLs", () => {
    const url = "https://tigerhire.io/storage/v1/object/sign/candidate-cvs/org-1/abc.pdf?token=xyz";
    expect(pathFromStorageUrl(url, "candidate-cvs")).toBe("org-1/abc.pdf");
    expect(resolveCvStorageObject({ fileUrl: url })).toEqual({
      bucket: "candidate-cvs",
      path: "org-1/abc.pdf",
    });
  });

  it("parses resumes bucket public URLs", () => {
    const url = "https://abcd.supabase.co/storage/v1/object/public/resumes/cand/v1.pdf";
    expect(resolveCvStorageObject({ fileUrl: url })).toEqual({
      bucket: "resumes",
      path: "cand/v1.pdf",
    });
  });

  it("prefers file_url bucket detection over storage_path", () => {
    expect(
      resolveCvStorageObject({
        storagePath: "cand-1/v2.pdf",
        fileUrl: "https://x/storage/v1/object/sign/candidate-cvs/cvs/public_1.pdf",
      }),
    ).toEqual({ bucket: "candidate-cvs", path: "cvs/public_1.pdf" });
  });

  it("maps cvs/* storage_path to candidate-cvs bucket", () => {
    expect(
      resolveCvStorageObject({
        storagePath: "cvs/public_1783359429424_vzdve8.pdf",
      }),
    ).toEqual({ bucket: "candidate-cvs", path: "cvs/public_1783359429424_vzdve8.pdf" });
  });

  it("parses bare cvs/ storage paths", () => {
    expect(resolveCvStorageObject({ fileUrl: "cvs/public_abc.pdf" })).toEqual({
      bucket: "candidate-cvs",
      path: "cvs/public_abc.pdf",
    });
  });

  it("parses authenticated storage URLs", () => {
    const url =
      "https://tigerhire.io/storage/v1/object/authenticated/candidate-cvs/cvs/public_x.pdf";
    expect(resolveCvStorageObject({ fileUrl: url })).toEqual({
      bucket: "candidate-cvs",
      path: "cvs/public_x.pdf",
    });
  });
});
