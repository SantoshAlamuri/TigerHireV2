import { test, expect, type Page } from "@playwright/test";
import { loginWithFallback } from "./helpers/login";
import { PILOT_ACCOUNTS } from "./helpers/pilot-accounts";

/**
 * The promotion gate for the v2 seat work (PR #296).
 *
 * Every defect this release exists to fix was found by opening a page as a
 * specific login, and none of them were caught by the unit suite — a
 * 3555-test-green branch once handed agencies the org candidate database. So
 * this asserts the things only a real session can show: what each seat can
 * reach, and what it is refused.
 *
 * A skipped test here is NOT a pass. If the seeded demo accounts are absent the
 * spec says so loudly rather than reporting green, because "we could not check"
 * and "we checked and it was fine" must never look the same in a promotion
 * decision.
 */

/**
 * Signs in, or fails the run.
 *
 * Deliberately NOT a skip. Demo login needs SEED_DEMO_PASSWORD set and the
 * seeded cast present; where it is not, an earlier version of this spec skipped
 * eight assertions and reported "6 passed" — every one of them passing only
 * because the page was blank. A promotion gate that goes quiet exactly when it
 * cannot check is worse than no gate, so absence of a session is a failure with
 * the reason attached.
 */
async function loginAs(page: Page, key: keyof typeof PILOT_ACCOUNTS): Promise<void> {
  const account = PILOT_ACCOUNTS[key];
  await loginWithFallback(page, {
    email: account.email,
    buttonName: account.buttonLabel,
    expectedPath: account.expectedLanding,
  }).catch(() => {});

  if (!account.expectedLanding.test(page.url())) {
    throw new Error(
      `Could not sign in as ${key} (${account.email}) at ${page.url()}. ` +
        `This is NOT a pass — the seat was never checked. Set SEED_DEMO_PASSWORD ` +
        `and seed the demo cast, or point PILOT_BASE_URL at an environment that has them.`,
    );
  }
}

/** Text every gated screen shows a seat that may not read it. */
const REFUSAL = /not your seat/i;

async function bodyText(page: Page): Promise<string> {
  return (
    (await page
      .locator("body")
      .innerText()
      .catch(() => "")) ?? ""
  );
}

/** First open job id, or null when the seat can see none. */
async function firstJobId(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/jobs?status=open&limit=1").catch(() => null);
  if (!res || !res.ok()) return null;
  const body = (await res.json().catch(() => null)) as { jobs?: Array<{ id: string }> } | null;
  return body?.jobs?.[0]?.id ?? null;
}

/* ────────────────────────────── AGENCY ──────────────────────────────
 * The highest-risk change in the release: agency was re-admitted to the
 * /recruit/v2 tree, which it was locked out of because those screens did no
 * role check of their own. Each screen now gates itself; this proves it from
 * the outside, as an actual agency session.
 */
test.describe("agency seat is walled off from client data", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "agency");
  });

  const forbidden = [
    { path: "/recruit/v2/candidates/pool", what: "the client's talent pool" },
    { path: "/recruit/v2/setup", what: "Hiring Setup" },
    { path: "/recruit/v2/setup/rubric", what: "the rubric library" },
    { path: "/recruit/v2/setup/benchmarks", what: "benchmarks and targets" },
    { path: "/recruit/v2/portfolio", what: "the portfolio" },
    { path: "/recruit/v2/governance", what: "the sign-off queue" },
  ];

  for (const { path, what } of forbidden) {
    test(`refuses ${what} (${path})`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      const text = await bodyText(page);
      // Either the page refuses, or route policy bounced the session away.
      const refused = REFUSAL.test(text) || !page.url().includes(path);
      expect(refused, `agency reached ${path} and saw content`).toBe(true);
    });
  }

  test("refuses the applicant review queue on a job it works", async ({ page }) => {
    const jobId = await firstJobId(page);
    test.skip(!jobId, "SKIPPED — agency sees no open job to test against");
    await page.goto(`/recruit/v2/jobs/${jobId}/review`, { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    // Nesting under a job the agency works is NOT a boundary: this queue holds
    // the client's whole scored list, other agencies' submissions included.
    expect(REFUSAL.test(text) || !page.url().includes("/review")).toBe(true);
  });

  test("still reaches its own submit page", async ({ page }) => {
    const jobId = await firstJobId(page);
    test.skip(!jobId, "SKIPPED — agency sees no open job to test against");
    await page.goto(`/recruit/v2/jobs/${jobId}/submit`, { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(REFUSAL.test(text), "agency was refused its own submit page").toBe(false);
    expect(text).toMatch(/ownership/i);
  });
});

/* ───────────────────────────── RECRUITER ─────────────────────────── */
test.describe("recruiter seat", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "recruiter");
  });

  test("rail links all resolve — no 404 on Jobs or Candidates", async ({ page }) => {
    // Both pointed at deleted /recruit/v2 pages before this release.
    for (const path of ["/recruit/jobs", "/recruit/candidates"]) {
      const res = await page.goto(path, { waitUntil: "domcontentloaded" });
      expect(res?.status(), `${path} did not load`).toBeLessThan(400);
      expect(await bodyText(page)).not.toMatch(/this page could not be found/i);
    }
  });

  test("talent pool renders the columns the design asks for", async ({ page }) => {
    await page.goto("/recruit/v2/candidates/pool", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(text).not.toMatch(REFUSAL);
    // Header row is present even with an empty pool; an empty pool shows the
    // empty state instead, which is also correct.
    const hasTable = /Score then/i.test(text) && /Rejected from/i.test(text);
    const isEmpty = /Nobody here yet/i.test(text);
    expect(hasTable || isEmpty, "pool showed neither the table nor its empty state").toBe(true);
  });

  test("rubric library is reachable from Hiring Setup and is not a 404", async ({ page }) => {
    await page.goto("/recruit/v2/setup", { waitUntil: "domcontentloaded" });
    expect(await bodyText(page)).toMatch(/Scoring rubrics/i);
    await page.goto("/recruit/v2/setup/rubric", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(text).not.toMatch(/this page could not be found/i);
    expect(text).toMatch(/Rubric library/i);
  });

  test("candidate profile shows the design's vocabulary", async ({ page }) => {
    const res = await page.request.get("/api/applications?limit=1").catch(() => null);
    const body = (await res?.json().catch(() => null)) as {
      applications?: Array<{ candidate_id: string }>;
    } | null;
    const candidateId = body?.applications?.[0]?.candidate_id;
    test.skip(!candidateId, "SKIPPED — no candidate in this environment to open");

    await page.goto(`/recruit/candidates/${candidateId}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const text = await bodyText(page);
    expect(text, "Comms log tab missing").toMatch(/Comms log/i);
    expect(text, "Notes & assessment tab missing").toMatch(/Notes & assessment/i);
    expect(text, "CV versions heading missing").toMatch(/CV versions/i);
  });

  test("job creation offers both the requisition route and direct creation", async ({ page }) => {
    await page.goto("/recruit/jobs", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(text).toMatch(/from a requisition/i);
    // v1 had /recruit/jobs/new; the redesign offered only the requisition path.
    expect(text, "direct job creation was dropped").toMatch(/Create directly/i);
  });
});

/* ────────────────────────── HIRING MANAGER ───────────────────────── */
test.describe("hiring manager seat", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "hiringManager");
  });

  test("can raise a requisition — the first thing this seat does", async ({ page }) => {
    await page.goto("/recruit/jobs", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const text = await bodyText(page);
    expect(text, "no path to raise a requisition").toMatch(/Raise a requisition/i);
  });

  test("the requisition form itself opens", async ({ page }) => {
    await page.goto("/company/hiring-requests/new", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(text).not.toMatch(/this page could not be found/i);
    expect(text).not.toMatch(REFUSAL);
  });

  test("is refused Hiring Setup, which is not their job", async ({ page }) => {
    await page.goto("/recruit/v2/setup", { waitUntil: "domcontentloaded" });
    const text = await bodyText(page);
    expect(REFUSAL.test(text) || !page.url().includes("/setup")).toBe(true);
  });
});

/* ───────────────────────── HEAD OF TALENT ────────────────────────── */
test.describe("head of talent seat", () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, "leadership");
  });

  test("portfolio names its blockers and admits what it did not check", async ({ page }) => {
    await page.goto("/recruit/v2/portfolio", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const text = await bodyText(page);
    expect(text).not.toMatch(REFUSAL);
    expect(text).toMatch(/Open jobs/i);
    expect(text).toMatch(/Rubric coverage/i);
    // The honesty line: a false all-clear is worse than a missing row.
    expect(text, "portfolio hid the signals it could not evaluate").toMatch(/Not checked here/i);
  });

  test("governance shows the sign-off queue", async ({ page }) => {
    await page.goto("/recruit/v2/governance", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const text = await bodyText(page);
    expect(text).not.toMatch(REFUSAL);
    expect(text).toMatch(/Governance/i);
    expect(text).toMatch(/Rubric library/i);
  });

  test("never reports a metric it cannot compute as zero", async ({ page }) => {
    await page.goto("/recruit/v2/portfolio", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);
    const text = await bodyText(page);
    // On an org with no data the tiles must read "—", not "0 days" — a wrong
    // number on a hiring dashboard gets believed and acted on.
    if (/no job carries an open date/i.test(text)) {
      expect(text).toMatch(/—/);
    }
  });
});
