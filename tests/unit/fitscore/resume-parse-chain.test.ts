import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/fitscore/haiku-text-parse", () => ({
  haikuEnrichResumeText: vi.fn(),
}));
vi.mock("@/lib/fitscore/vision-fallback", () => ({
  visionFallback: vi.fn(),
}));
vi.mock("@/lib/fitscore/scoring-observability", () => ({
  recordFitScoreObservabilityEvent: vi.fn(),
}));
vi.mock("@/lib/services/extract-document-text", () => ({
  detectMimeFromBuffer: vi.fn(() => null),
  extractTextFromBuffer: vi.fn(),
  inferMimeFromName: vi.fn((name: string) => {
    if (name.endsWith(".docx"))
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    if (name.endsWith(".pdf")) return "application/pdf";
    return null;
  }),
}));
vi.mock("@/lib/services/docx-extract", () => ({
  extractDocxPlainText: vi.fn(),
  patchMammothXmlParserForXmldom09: vi.fn(),
}));

import { haikuEnrichResumeText } from "@/lib/fitscore/haiku-text-parse";
import { visionFallback } from "@/lib/fitscore/vision-fallback";
import { extractDocxPlainText } from "@/lib/services/docx-extract";
import { runResumeParseChain } from "@/lib/fitscore/resume-parse-chain";

describe("runResumeParseChain", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESUME_PARSE_MIN_CHARS = "2000";
    process.env.FF_CV_PARSER_HAIKU_ENABLED = "true";
    process.env.FF_VISION_FALLBACK_ENABLED = "true";
  });

  it("uses tier 1 when pdfjs text meets min chars", async () => {
    const longText = "x".repeat(2500);
    const result = await runResumeParseChain({
      pdfjsText: longText,
      initialMethod: "pdfjs",
      attribution: { candidateId: "c1" },
    });
    expect(result.tier).toBe(1);
    expect(result.parse_method).toBe("pdfjs");
    expect(haikuEnrichResumeText).not.toHaveBeenCalled();
    expect(visionFallback).not.toHaveBeenCalled();
  });

  it("uses tier 2 when Haiku enriches above min chars", async () => {
    vi.mocked(haikuEnrichResumeText).mockResolvedValue("y".repeat(2100));
    const result = await runResumeParseChain({
      pdfjsText: "short",
      pdfBuffer: Buffer.from("pdf"),
      attribution: { candidateId: "c2" },
    });
    expect(result.tier).toBe(2);
    expect(result.parse_method).toBe("haiku");
    expect(visionFallback).not.toHaveBeenCalled();
  });

  it("uses tier 1 mammoth for docx when text meets min chars", async () => {
    vi.mocked(extractDocxPlainText).mockResolvedValue("d".repeat(2500));
    const result = await runResumeParseChain({
      pdfjsText: "",
      fileBuffer: Buffer.from("docx-bytes"),
      fileName: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      attribution: { candidateId: "c-docx" },
    });
    expect(result.tier).toBe(1);
    expect(result.parse_method).toBe("docx");
    expect(extractDocxPlainText).toHaveBeenCalled();
    expect(haikuEnrichResumeText).not.toHaveBeenCalled();
  });

  it("uses tier 3 when Haiku insufficient and PDF buffer present", async () => {
    vi.mocked(haikuEnrichResumeText).mockResolvedValue("still short");
    vi.mocked(visionFallback).mockResolvedValue("z".repeat(3000));
    const result = await runResumeParseChain({
      pdfjsText: "tiny",
      pdfBuffer: Buffer.from("%PDF"),
      attribution: { candidateId: "c3" },
    });
    expect(result.tier).toBe(3);
    expect(result.parse_method).toBe("vision");
  });
});
