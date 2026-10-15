/**
 * Pulls the requirements for a v2 screen out of the approved design artifact.
 *
 * Shared by the conformance test and the gap report so they can never drift
 * apart and quietly disagree about what the design asks for.
 *
 * The first version of this only read stat captions and flag columns. It
 * reported "analytics: nothing missing" for a page whose tabs, table columns
 * and whole sub-screens differed from the design — because it never looked at
 * tabs, headings or table columns. A checker that inspects two markup patterns
 * and calls the result conformance is worse than no checker: it converts an
 * unverified screen into a green tick. Everything a person would actually read
 * on the screen is extracted here.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Spec screen key → the built files that should satisfy it.
 *
 * Lives here, not in the two consumers. It was copied into both the test and
 * the gap report, and they had already drifted: a screen registered in one was
 * absent from the other, so the report cheerfully listed as unbuilt a page the
 * test knew about. Two definitions of "what implements this screen" is the same
 * failure mode as two homes for one route.
 */
export const MANIFEST = {
  "rec:jobs": ["../jobs/page.tsx", "../jobs/JobPipeline.tsx"],
  "rec:job": ["../jobs/[id]/page.tsx", "../jobs/[id]/ActionRows.tsx"],
  "rec:jobsetup": ["jobs/[id]/setup/page.tsx", "jobs/[id]/setup/RubricReuse.tsx"],
  "rec:upload": ["jobs/[id]/add/page.tsx"],
  "rec:review": [
    "jobs/[id]/review/page.tsx",
    "jobs/[id]/review/ScoreTriple.tsx",
    "jobs/[id]/review/Logistics.tsx",
    "jobs/[id]/review/QueueList.tsx",
    "jobs/[id]/review/EvidenceColumns.tsx",
  ],
  "rec:profile": [
    "../candidates/[id]/page.tsx",
    "../../../../components/dashboard/CandidateDecisionStrip.tsx",
  ],
  "rec:candidates": ["../candidates/page.tsx", "../candidates/CandidateFilters.tsx"],
  "rec:pool": ["candidates/pool/page.tsx"],
  "rec:analytics": ANALYTICS_FILES(),
  "rec:an-trends": ANALYTICS_FILES(),
  "rec:an-jobs": ANALYTICS_FILES(),
  "rec:an-quality": ANALYTICS_FILES(),
  "rec:setup": ["setup/page.tsx"],
  "rec:setup-rubric": ["setup/rubric/page.tsx", "setup/rubric/[jobId]/page.tsx"],
  // The design defines ta:rubric as the SAME rubric body, entered from
  // Governance rather than Hiring Setup — one page, two ways in.
  "ta:rubric": ["setup/rubric/[jobId]/page.tsx"],
  "ta:portfolio": ["portfolio/page.tsx"],
  "ta:gov": ["governance/page.tsx"],
  "rec:integrations": ["setup/integrations/page.tsx"],
  // The four stage tiles share one parameterised route.
  "rec:stage-applied": [
    "jobs/[id]/stage/[stage]/page.tsx",
    "jobs/[id]/stage/[stage]/StageTable.tsx",
  ],
  "rec:stage-screened": [
    "jobs/[id]/stage/[stage]/page.tsx",
    "jobs/[id]/stage/[stage]/StageTable.tsx",
  ],
  "rec:stage-interview": ["jobs/[id]/interviews/page.tsx"],
  "rec:stage-offer": ["jobs/[id]/offers/page.tsx"],
  "hm:week": ["../jobs/SeatHome.tsx"],
  "hm:job": ["../jobs/[id]/page.tsx", "../jobs/[id]/ActionRows.tsx"],
  "hm:scorecard": ["candidates/[id]/scorecard/page.tsx"],
  "hm:brief": ["candidates/[id]/brief/page.tsx"],
  "ag:jobs": ["../jobs/SeatHome.tsx", "../jobs/AgencyBrief.tsx"],
  "ag:subs": ["../jobs/SeatHome.tsx"],
  "ag:submit": ["jobs/[id]/submit/page.tsx"],
  "ag:candidate": ["candidates/[id]/submission/page.tsx"],
};

/** Analytics sub-tabs are tabs on one page, not separate routes. */
function ANALYTICS_FILES() {
  return [
    "../analytics/page.tsx",
    "../analytics/JobPerformance.tsx",
    "../analytics/TalentMetrics.tsx",
    "../analytics/Trends.tsx",
    "../analytics/ByJobDepth.tsx",
    "../analytics/Quality.tsx",
    "../analytics/SourceTable.tsx",
  ];
}

/** Every screen key defined in the artifact, in document order. */
export function screenKeys(spec) {
  return [...spec.matchAll(/"([a-z]{2,3}:[a-z-]+)": \{ rail/g)].map((m) => m[1]);
}

/** The artifact source for one screen, up to the start of the next screen. */
export function screenBody(spec, key) {
  const start = spec.indexOf(`"${key}": { rail`);
  if (start === -1) return "";
  const rest = spec.slice(start + 10);
  const next = rest.search(/"[a-z]{2,3}:[a-z-]+": \{ rail/);
  return next === -1 ? rest : rest.slice(0, next);
}

function clean(raw) {
  return raw
    .replace(/<[^>]*>/g, " ")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[✓⚠✗·•→←↵]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Labels a person would read on the screen, grouped by what they are, so a
 * failure says "the Trends tab is missing" rather than listing a bare string.
 */
export function requiredLabels(body) {
  const out = new Map();
  const grab = (kind, re, group = 1) => {
    for (const m of body.matchAll(re)) {
      const t = clean(m[group]);
      // Template holes are data, not design vocabulary.
      if (t.length < 3 || t.length > 44 || t.includes("${") || !/[a-z]/i.test(t)) continue;
      // Nor are named instances. The artifact illustrates the rubric library
      // with "Backend rubric v3" and "Design rubric v1" — fictional rows, in
      // markup indistinguishable from a real section heading. Requiring them
      // would mean hardcoding one company's sample rubric names into the page
      // to go green, which is faking conformance rather than achieving it.
      // A section heading does not carry a version number; an instance does.
      if (/\sv\d+$/.test(t)) continue;
      if (!out.has(t)) out.set(t, kind);
    }
  };

  // Navigation the design promises: sub-tabs within a screen.
  for (const m of body.matchAll(/tabs: \[([^\]]*)\]/g)) {
    for (const t of m[1].split(",")) {
      const label = clean(t.replace(/['"]/g, ""));
      if (label.length >= 3 && !label.includes("${") && !out.has(label)) out.set(label, "tab");
    }
  }

  grab("stat", /<div class="k">([^<]{3,44})<\/div>/g);
  grab("flag column", /<div class="fc [gar]"><h4><span>([^<]{3,44})<\/span>/g);
  grab("section", /<h3[^>]*>([^<]{3,44})</g);
  grab("section", /<div class="sec-t">([^<]{3,44})</g);
  grab("heading", /<h4[^>]*>(?:<span>)?([^<]{3,44})</g);
  grab("table column", /<th[^>]*>([^<]{3,44})<\/th>/g);

  return [...out].map(([label, kind]) => ({ label, kind }));
}

/**
 * The text of the pages that implement a screen, plus only the libs those
 * pages actually import.
 *
 * Scanning all of src/lib/v2 would let a label defined in some unrelated
 * module satisfy a screen that never renders it — which is exactly how an
 * earlier version of this check passed screens that were visibly wrong.
 */
export function builtText(appDir, libDir, files, srcDir) {
  const pages = files.map((f) =>
    existsSync(join(appDir, f)) ? readFileSync(join(appDir, f), "utf8") : "",
  );
  const seen = new Set();
  const queue = [];
  for (const src of pages) {
    for (const m of src.matchAll(/@\/lib\/v2\/([a-z-]+)/g)) queue.push(`${m[1]}.ts`);
    // Sibling components live next to the page and are part of the screen.
    for (const m of src.matchAll(/from "\.\/([A-Za-z]+)"/g)) queue.push(`::${m[1]}.tsx`);
    // Converged pages compose shared components under @/components — the
    // Decision Strip renders the ICP stat and the tab strip renders Activity
    // and Notes. Not following these made the ratchet report a page as missing
    // what it visibly shows, which is worse than not measuring it.
    for (const m of src.matchAll(/from "@\/components\/([A-Za-z0-9\-\/]+)"/g))
      queue.push(`@@${m[1]}.tsx`);
  }
  const extra = [];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    if (name.startsWith("::")) {
      const base = name.slice(2);
      for (const dir of files.map((f) => join(appDir, f, ".."))) {
        const p = join(dir, base);
        if (existsSync(p)) {
          const src = readFileSync(p, "utf8");
          extra.push(src);
          for (const m of src.matchAll(/@\/lib\/v2\/([a-z-]+)/g)) queue.push(`${m[1]}.ts`);
          break;
        }
      }
    } else if (name.startsWith("@@")) {
      if (!srcDir) continue;
      const p = join(srcDir, "components", name.slice(2));
      if (existsSync(p)) {
        const src = readFileSync(p, "utf8");
        extra.push(src);
        for (const m of src.matchAll(/from "\.\/([A-Za-z]+)"/g)) queue.push(`::${m[1]}.tsx`);
      }
    } else if (existsSync(join(libDir, name))) {
      extra.push(readFileSync(join(libDir, name), "utf8"));
    }
  }
  return [...pages, ...extra].join("\n");
}

/**
 * Both sides of the comparison go through this. The spec writes "Apply→Interview"
 * and the build writes the same thing, but the extractor strips arrows out of
 * spec text — so without normalising the built source identically, a label that
 * IS rendered gets reported as missing. A checker that cries wolf gets ignored.
 */
export function normalizeForMatch(text) {
  return text
    .replace(/&[a-z]+;/g, " ")
    .replace(/[✓⚠✗·•→←↵]/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function readSpec(root) {
  return readFileSync(join(root, "tests/fixtures/approved-ui-spec.html"), "utf8");
}

export { readdirSync };
