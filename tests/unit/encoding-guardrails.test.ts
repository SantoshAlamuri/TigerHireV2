import { describe, it, expect } from "vitest";
import { buildNormalizedJob } from "@/lib/jobs/sources/normalize";
import { normalizeJdTextForParsing } from "@/lib/services/anthropic";
import { normalizeParsedCV } from "@/lib/agents/normalizer";
import { normalizeTextForMatch } from "@/lib/fitscore/hybrid/quote-validation";
import { extractTextFromBuffer } from "@/lib/services/extract-document-text";
import type { ParsedCV } from "@/lib/agents/schemas";

/**
 * Encoding guardrails: CLEAN INPUT MUST STAY CLEAN.
 *
 * Motivation: an audit of a competitor's scraped-jobs API found double-encoded
 * UTF-8 stored at rest (174 mojibake sequences — "RegiÃ£o", "EnergÃ­a",
 * "enquÃªtes" — in a single 10-job response). Once corrupt text lands in the
 * DB, every consumer inherits it and it is effectively unfixable after the
 * fact. TigerHire ingests free text through comparable pipelines (email
 * intake, CV parsing, scraped/aggregated job rows), so these tests pin the
 * invariant that our normalisation seams never corrupt correctly-encoded
 * UTF-8 (no stripping of non-ASCII, no U+FFFD replacement chars, no
 * double-encoding), and they document exactly what each seam does and does
 * NOT do about already-corrupt input.
 *
 * Seams under test (the exported pure functions text passes through on the
 * way to the DB):
 *   - buildNormalizedJob        src/lib/jobs/sources/normalize.ts   (scraped jobs: greenhouse/lever/adzuna/jsearch)
 *   - normalizeJdTextForParsing src/lib/services/anthropic.ts       (JD upload/URL/paste flows)
 *   - normalizeParsedCV         src/lib/agents/normalizer.ts        (CV parse → candidate fields)
 *   - normalizeTextForMatch     src/lib/fitscore/hybrid/quote-validation.ts (evidence-quote matching)
 *   - extractTextFromBuffer     src/lib/services/extract-document-text.ts   (text/plain branch; PDF/DOCX branches need real files)
 *
 * Pipelines with NO testable pure normalisation seam (documented finding, not
 * fixed here — the route/DB-coupled code passes free text straight through):
 *   - /api/intake/email (src/app/api/intake/email/route.ts): zod .trim() only;
 *     name/subject/text/from go into savePublicApplication verbatim.
 *   - savePublicApplication (src/lib/agents/public-apply.ts): DB-coupled;
 *     its nameFromFileName() helper is not exported.
 *   - Source connectors (src/lib/jobs/sources/greenhouse.ts etc.): fetch-coupled;
 *     greenhouse stores HTML-escaped `content` with no entity decode.
 */

// ---------------------------------------------------------------------------
// Mojibake detection helper
// ---------------------------------------------------------------------------

/**
 * Classic mojibake signatures. Deliberately conservative: single "Ã", "Â",
 * "â", "à" are real letters (Portuguese "São" is ã, NOT an Ã-sequence;
 * "Ângelo", "à la carte" are legit) — we only flag them when followed by a
 * character that can only plausibly come from misdecoding a UTF-8
 * continuation byte.
 */
const MOJIBAKE_PATTERNS: ReadonlyArray<RegExp> = [
  // Unicode replacement character — lossy decode already happened.
  /�/,
  // "Ã" + Latin-1-range char = double-encoded Latin-1 Supplement letter
  // (é→"Ã©", ã→"Ã£", ü→"Ã¼", í→"Ã­", ê→"Ãª"). Legit "Ã" is followed by
  // ASCII ("SÃO", "CÃES"), which this range excludes.
  /Ã[\u0080-¿]/,
  // "â€" = double-encoded General Punctuation (’ “ ” – — …). Second char is
  // U+0080 (latin1 misdecode) or "€" U+20AC (windows-1252 misdecode).
  /â[\u0080€]/,
  // "Â" + space/Latin-1 punctuation = double-encoded NBSP/©/«/° ("Â ", "Â©",
  // "Â«"). Legit "Â"/"Ângelo" is followed by a letter, which this excludes.
  /Â[\s\u0080-¿]/,
  // "à¤/à¥" (Devanagari) and "à®/à¯" (Tamil) double-encoding prefixes.
  // Legit "à" is never followed by ¤ ¥ ® ¯.
  /à[¤¥®¯]/,
  // "Ä"/"Å" + U+0080–U+00BF = double-encoded Latin Extended-A (ā→"Ä\u0081",
  // ū→"Å«", ē/ī/ō likewise — Māori and romanised Indic vowels). Legit
  // "Ä"/"Å" (Ärger, Århus) are followed by ASCII, which this excludes.
  /[ÄÅ][\u0080-¿]/,
  // Bare C1 control codepoints never occur in legitimate text; latin1
  // misdecodes of multi-byte UTF-8 almost always produce them.

  /[\u0080-\u009f]/,
];

/** True when `s` contains a classic double-encoded-UTF-8 / lossy-decode signature. */
export function containsMojibake(s: string): boolean {
  return MOJIBAKE_PATTERNS.some((p) => p.test(s));
}

/**
 * Simulate the classic corruption: UTF-8 bytes misread as Latin-1.
 * latin1Misdecode("München") === "MÃ¼nchen".
 */
function latin1Misdecode(clean: string): string {
  return Buffer.from(clean, "utf8").toString("latin1");
}

/** Lone-surrogate detector (a lone surrogate becomes U+FFFD at the DB/JSON boundary). */
function hasLoneSurrogate(s: string): boolean {
  return !s.isWellFormed();
}

// ---------------------------------------------------------------------------
// Shared corpora
// ---------------------------------------------------------------------------

/** Correctly-encoded text that must NEVER be flagged and NEVER be altered. */
const CLEAN_SAMPLES: ReadonlyArray<string> = [
  "São Paulo",
  "München",
  "Cañón del Colca",
  "résumé",
  "François",
  "Māori",
  "Bengalūru",
  "Zürich — El Niño, crème brûlée",
  "नमस्ते, मैं बेंगलुरु में रहता हूँ", // Hindi / Devanagari
  "வணக்கம், சென்னை", // Tamil
  "Ângelo ÂNGULO", // legit  followed by letters — must not false-positive
  "à la carte", // legit à followed by space
  "© 2026 TigerHire · ₹4,999 · €99", // bare symbols, no mojibake prefix
  "🚀 Launch-ready 🇮🇳", // emoji incl. surrogate pairs
];

/** Known-corrupt text that MUST be flagged. */
const MOJIBAKE_SAMPLES: ReadonlyArray<string> = [
  "MÃ¼nchen", // München
  "CanÃ£", // ...ã
  "RegiÃ£o Metropolitana", // "RegiÃ£o" — verbatim from the competitor audit
  "EnergÃ­a renovable", // "EnergÃ­a"
  "enquÃªtes", // "enquÃªtes"
  "donâ€™t", // "donâ€™t" (windows-1252 flavour)
  "â€œquotedâ€\u009d", // “quoted”
  "â€“ range â€” dash", // â€“ / â€”
  "CafÃ©Â Bar", // "CafÃ©Â Bar" — Ã© and Â<nbsp>
  "Â© 2026", // "Â©"
  "broken � char", // replacement char
];

// ---------------------------------------------------------------------------
// 1. The detector itself
// ---------------------------------------------------------------------------

describe("containsMojibake", () => {
  it.each(MOJIBAKE_SAMPLES.map((s) => [s]))("flags corrupt input %j", (bad) => {
    expect(containsMojibake(bad)).toBe(true);
  });

  it.each(CLEAN_SAMPLES.map((s) => [s]))("does NOT flag legitimate text %j", (clean) => {
    expect(containsMojibake(clean)).toBe(false);
  });

  it("flags any clean sample after a simulated latin1 misdecode", () => {
    for (const clean of CLEAN_SAMPLES) {
      if (!/[^\x20-\x7E]/.test(clean)) continue; // pure-ASCII samples survive misdecoding
      const corrupted = latin1Misdecode(clean);
      expect(corrupted, `misdecode of ${JSON.stringify(clean)}`).not.toBe(clean);
      expect(containsMojibake(corrupted), `misdecode of ${JSON.stringify(clean)}`).toBe(true);
    }
  });

  it("distinguishes the classic confusable pairs", () => {
    expect(containsMojibake("München")).toBe(false);
    expect(containsMojibake("MÃ¼nchen")).toBe(true);
    expect(containsMojibake("São")).toBe(false); // ã is a single codepoint, not Ã+£
    expect(containsMojibake(latin1Misdecode("São"))).toBe(true); // "SÃ£o"
    expect(containsMojibake("Cañón")).toBe(false);
    expect(containsMojibake("CanÃ£")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Scraped-jobs seam: buildNormalizedJob
// ---------------------------------------------------------------------------

describe("buildNormalizedJob (scraped jobs: greenhouse/lever/adzuna/jsearch)", () => {
  const baseInput = {
    source: "greenhouse" as const,
    source_job_id: 12345,
    source_url: "https://boards.greenhouse.io/acme/jobs/12345",
    title: "Ingénieur Données — São Paulo liaison",
    company: "Café Análisis Pvt Ltd",
    description:
      "Role: análise de dados. नमस्ते — हिंदी ज़रूरी है. வணக்கம். Résumé screening for François & Māori-speaking candidates. 🚀",
    location: "Bengaluru, India",
    posted_at: "2026-08-01T00:00:00Z",
    raw: {},
  };

  it("preserves correctly-encoded accented/Indic/emoji text unchanged", () => {
    const job = buildNormalizedJob(baseInput);
    expect(job).not.toBeNull();
    expect(job!.title).toBe(baseInput.title);
    expect(job!.company).toBe(baseInput.company);
    expect(job!.description).toBe(baseInput.description);
    for (const field of [job!.title, job!.company, job!.description]) {
      expect(containsMojibake(field)).toBe(false);
      expect(hasLoneSurrogate(field)).toBe(false);
    }
  });

  it.each(CLEAN_SAMPLES.map((s) => [s]))("round-trips clean description %j", (clean) => {
    const job = buildNormalizedJob({ ...baseInput, description: clean });
    expect(job).not.toBeNull();
    expect(job!.description).toBe(clean.trim());
    expect(containsMojibake(job!.description)).toBe(false);
  });

  it("passes already-corrupt source text through verbatim (documented: no repair layer)", () => {
    // buildNormalizedJob is trim+truncate only. If a source ever ships
    // double-encoded text (exactly the competitor failure mode), it lands in
    // the DB as-is. Repair/rejection would have to happen at this seam —
    // this test documents that today it does not.
    const job = buildNormalizedJob({
      ...baseInput,
      description: "RegiÃ£o Metropolitana de SÃ£o Paulo",
    });
    expect(job).not.toBeNull();
    expect(job!.description).toBe("RegiÃ£o Metropolitana de SÃ£o Paulo");
    expect(containsMojibake(job!.description)).toBe(true);
  });

  // REAL BUG (documented, not fixed): description is truncated with
  // String.prototype.slice(0, 5000), which counts UTF-16 code units and can
  // cut an astral character (emoji, some CJK) in half, leaving a lone
  // surrogate. A lone surrogate is not valid Unicode: it becomes U+FFFD (or
  // an insert error) at the JSON/Postgres boundary — i.e. this seam can
  // CREATE corruption from clean input. Fix would be to truncate at a code
  // point (or grapheme) boundary. Same pattern exists in
  // normalizeSkillName/normalizeCompanyName/normalizeLocation
  // (src/lib/agents/normalizer.ts) and truncateAtWordBoundary callers.
  it.fails("does not split a surrogate pair at the 5000-char truncation boundary", () => {
    const description = "x".repeat(4999) + "😀 and more text after the emoji";
    const job = buildNormalizedJob({ ...baseInput, description });
    expect(job).not.toBeNull();
    expect(job!.description.length).toBeLessThanOrEqual(5000);
    expect(hasLoneSurrogate(job!.description)).toBe(false); // currently FAILS: ends in \uD83D
  });
});

// ---------------------------------------------------------------------------
// 3. JD text seam: normalizeJdTextForParsing
// ---------------------------------------------------------------------------

describe("normalizeJdTextForParsing (JD upload/URL/paste)", () => {
  it("preserves accented/Indic/emoji text; only whitespace is normalised", () => {
    const input =
      "Résumé screening — São Paulo & Bengalūru.\nनमस्ते, हिंदी ज़रूरी है। வணக்கம்.\nFrançois / Māori welcome 🚀";
    expect(normalizeJdTextForParsing(input)).toBe(input);
  });

  it.each(CLEAN_SAMPLES.map((s) => [s]))("round-trips clean sample %j", (clean) => {
    const out = normalizeJdTextForParsing(clean);
    expect(out).toBe(clean.trim());
    expect(containsMojibake(out)).toBe(false);
  });

  it("maps NBSP to a plain space by design, without touching anything else", () => {
    expect(normalizeJdTextForParsing("São Paulo")).toBe("São Paulo");
  });

  it("passes already-corrupt text through verbatim (documented: whitespace-only normaliser)", () => {
    const bad = "EnergÃ­a renovable";
    expect(normalizeJdTextForParsing(bad)).toBe(bad);
    expect(containsMojibake(normalizeJdTextForParsing(bad))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. CV parse seam: normalizeParsedCV
// ---------------------------------------------------------------------------

describe("normalizeParsedCV (CV parse → candidate fields)", () => {
  const baseParsedCv: ParsedCV = {
    full_name: "François D'Souza",
    email: "francois@example.com",
    phone: "+91 98765 43210",
    canonical_skills: ["React", "Communication écrite", "हिंदी", "Português"],
    seniority_level: "senior",
    years_experience: 8,
    current_title: "Ingénieur Logiciel",
    current_company: "Média Café Solutions Pvt Ltd",
    location_city: "Bengalūru",
    salary_expectation_min: 20,
    salary_expectation_max: 30,
    availability: "1_month",
    authenticity_flags: [],
  };

  it("preserves accents and non-Latin scripts across every normalised field", () => {
    const out = normalizeParsedCV(baseParsedCv);

    expect(out.full_name).toBe("François D'Souza");
    expect(out.current_title).toBe("Ingénieur Logiciel");
    expect(out.location_city).toBe("Bengalūru");
    // Company normalisation canonicalises "Pvt Ltd" but must keep the accents.
    expect(out.current_company).toBe("Média Café Solutions Pvt Ltd");
    // Skills are lowercased/deduped by design — accents and Devanagari must survive.
    expect(out.canonical_skills).toContain("communication écrite");
    expect(out.canonical_skills).toContain("हिंदी");
    expect(out.canonical_skills).toContain("português");

    for (const field of [
      out.full_name,
      out.current_title,
      out.current_company,
      out.location_city,
      ...out.canonical_skills,
    ]) {
      expect(field).not.toBeNull();
      expect(containsMojibake(field as string)).toBe(false);
      expect(hasLoneSurrogate(field as string)).toBe(false);
    }
  });

  it("does not strip non-ASCII from location/company under whitespace collapsing", () => {
    const out = normalizeParsedCV({
      ...baseParsedCv,
      location_city: "  São   Paulo  ",
      current_company: "  Añejo   Média  Labs ",
    });
    expect(out.location_city).toBe("São Paulo");
    expect(out.current_company).toBe("Añejo Média Labs");
  });

  it("passes already-corrupt parsed fields through (documented: no repair layer)", () => {
    const out = normalizeParsedCV({
      ...baseParsedCv,
      location_city: "SÃ£o Paulo",
    });
    // Repair is not this function's job — but it must also not mask the
    // corruption (masking would make it undetectable downstream).
    expect(out.location_city).toBe("SÃ£o Paulo");
    expect(containsMojibake(out.location_city as string)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Evidence-quote matching seam: normalizeTextForMatch
// ---------------------------------------------------------------------------

describe("normalizeTextForMatch (resume↔quote matching)", () => {
  it("preserves accented and Indic text under NFKC", () => {
    // NFC-composed accents and Devanagari/Tamil are NFKC-stable.
    const input = "François — São Paulo résumé, नमस्ते வணக்கம் 🚀";
    expect(normalizeTextForMatch(input)).toBe(input);
    expect(containsMojibake(normalizeTextForMatch(input))).toBe(false);
  });

  it("composes decomposed accents instead of stripping them", () => {
    // "é" as e + combining acute (NFD) must become the composed é, not "e".
    expect(normalizeTextForMatch("résumé")).toBe("résumé");
  });

  it("maps smart quotes to ASCII and collapses whitespace by design — nothing else", () => {
    expect(normalizeTextForMatch("“François’s”   résumé")).toBe('"François\'s" résumé');
  });

  it("does not introduce replacement chars or lone surrogates", () => {
    for (const clean of CLEAN_SAMPLES) {
      const out = normalizeTextForMatch(clean);
      expect(out).not.toContain("�");
      expect(hasLoneSurrogate(out)).toBe(false);
      expect(containsMojibake(out), `normalizeTextForMatch(${JSON.stringify(clean)})`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. CV/JD text extraction seam: extractTextFromBuffer (text/plain branch)
// ---------------------------------------------------------------------------

describe("extractTextFromBuffer (text/plain branch of CV/JD extraction)", () => {
  it("round-trips correctly-encoded UTF-8 bytes exactly", async () => {
    const input = "São Paulo — résumé of François.\nनमस्ते, Bengalūru. வணக்கம் 🚀";
    const out = await extractTextFromBuffer(Buffer.from(input, "utf8"), "text/plain", "cv.txt");
    expect(out).toBe(input);
    expect(containsMojibake(out)).toBe(false);
  });

  it.each(CLEAN_SAMPLES.map((s) => [s]))("round-trips clean sample %j", async (clean) => {
    const out = await extractTextFromBuffer(Buffer.from(clean, "utf8"), "text/plain", "cv.txt");
    expect(out).toBe(clean);
    expect(containsMojibake(out)).toBe(false);
  });

  it("documents the limitation: legacy-encoded (Latin-1/Windows-1252) files corrupt to U+FFFD", async () => {
    // extractTextFromBuffer assumes UTF-8 and does no charset detection. A
    // .txt CV saved in Latin-1 (still common from old Word/Windows exports)
    // decodes lossily: every accented char becomes U+FFFD, and that corrupt
    // text is what gets stored/scored. This test documents the current
    // behaviour; fixing it would mean charset sniffing at this seam.
    const latin1Bytes = Buffer.from("François — résumé, São Paulo", "latin1");
    const out = await extractTextFromBuffer(latin1Bytes, "text/plain", "cv.txt");
    expect(out).not.toBe("François — résumé, São Paulo");
    expect(out).toContain("�");
    expect(containsMojibake(out)).toBe(true);
  });
});
