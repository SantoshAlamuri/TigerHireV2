import { test, expect, type Page } from "@playwright/test";
import { PILOT_ACCOUNTS, type PilotAccountKey } from "./helpers/pilot-accounts";
import { loginWithFallback } from "./helpers/login";
import { pilotApiHeaders } from "./helpers/pilot-api";

/**
 * Seat x candidate authorization matrix.
 *
 * Every finding in the 2026-08-05 security pass was a seat seeing more than its
 * seat should, and every one was invisible to 4000+ unit tests because each
 * route's own tests only ever exercised that route's own idea of the rule:
 *
 *   - hiring managers could open any candidate in their company on the detail
 *     route, the resume route and the data agent, while the list route
 *     correctly showed them only their own jobs' candidates;
 *   - recruiters could reach candidates their agency was working for a
 *     competitor, because the agencies were flattened into a plain org list.
 *
 * Rather than hand-seed "a candidate seat X must not see" — which rots the
 * moment the seed changes — this asserts an invariant that holds for every
 * seat and needs no fixture:
 *
 *   DETAIL IS NEVER WIDER THAN LIST.
 *
 * A candidate that super_admin can see but a seat's own list does not contain
 * must return 403 on that seat's detail route. That is exactly the shape of
 * both bugs above, and it generalises to surfaces nobody has written yet.
 *
 * Requires a seeded environment (npm run pilot:seed) and the app on
 * playwright's baseURL. Skips rather than fails when a seat has no data to
 * compare, so an empty database cannot read as a passing security check —
 * the skip reason says which seat was not covered.
 */

const SEATS_UNDER_TEST: PilotAccountKey[] = ["hiringManager", "recruiter", "leadership", "agency"];

interface CandidateRow {
  id: string;
}

async function loginAs(page: Page, key: PilotAccountKey) {
  const account = PILOT_ACCOUNTS[key];
  await loginWithFallback(page, {
    email: account.email,
    expectedPath: account.expectedLanding,
    buttonName: account.buttonLabel,
  });
}

async function listCandidateIds(page: Page, limit = 100): Promise<string[]> {
  const res = await page.request.get(`/api/candidates?limit=${limit}`, {
    headers: pilotApiHeaders(),
  });
  if (!res.ok()) return [];
  const json = (await res.json()) as Record<string, unknown>;
  const data = (json.data ?? json) as Record<string, unknown>;
  const rows = (data.candidates ?? []) as CandidateRow[];
  return rows.map((r) => r.id).filter(Boolean);
}

test.describe("candidate authorization is consistent per seat", () => {
  // Serial: each case re-logs the shared page as a different seat.
  test.describe.configure({ mode: "serial" });

  let allCandidateIds: string[] = [];

  test("super_admin can enumerate candidates (baseline for the comparison)", async ({ page }) => {
    await loginAs(page, "superAdmin");
    allCandidateIds = await listCandidateIds(page);
    test.skip(
      allCandidateIds.length === 0,
      "No candidates visible to super_admin — seed the environment (npm run pilot:seed); " +
        "an empty database would make every assertion below vacuously pass.",
    );
    expect(allCandidateIds.length).toBeGreaterThan(0);
  });

  for (const seat of SEATS_UNDER_TEST) {
    test(`${seat}: detail route is never wider than the list route`, async ({ page }) => {
      test.skip(allCandidateIds.length === 0, "No baseline candidates to compare against.");

      await loginAs(page, seat);
      const visibleToSeat = new Set(await listCandidateIds(page));
      const outOfScope = allCandidateIds.filter((id) => !visibleToSeat.has(id));

      test.skip(
        outOfScope.length === 0,
        `${seat} can list every candidate super_admin can, so there is nothing out of ` +
          "scope to probe. Seed a candidate outside this seat's scope to cover it.",
      );

      // Probe a bounded sample: one 200 here is a real leak, so breadth beats depth.
      //
      // 403 and 404 both count as denied. Which one comes back depends on where
      // the caller is stopped: the route's scope check answers 403, while RLS
      // filtering the row out first makes the lookup answer 404. Asserting the
      // exact code would make this test a description of today's plumbing
      // rather than of the security property, and 404 is the better answer
      // anyway — it does not confirm the candidate exists.
      for (const candidateId of outOfScope.slice(0, 5)) {
        const res = await page.request.get(`/api/candidates/${candidateId}`, {
          headers: pilotApiHeaders(),
        });
        expect(
          [403, 404],
          `${seat} got ${res.status()} for candidate ${candidateId}, which its own list ` +
            "does not show. Detail has drifted wider than list — the exact shape of the " +
            "hiring-manager and agency-delegation leaks.",
        ).toContain(res.status());
      }
    });

    test(`${seat}: candidates it CAN list stay reachable`, async ({ page }) => {
      await loginAs(page, seat);
      const visible = await listCandidateIds(page, 5);

      test.skip(
        visible.length === 0,
        `${seat} lists no candidates, so there is nothing to confirm access to.`,
      );

      // The mirror of the test above: tightening scope must not lock a seat out
      // of its own work. This is what would have caught an over-tightened fix.
      for (const candidateId of visible) {
        const res = await page.request.get(`/api/candidates/${candidateId}`, {
          headers: pilotApiHeaders(),
        });
        expect(
          res.status(),
          `${seat} cannot open candidate ${candidateId} even though its own list shows it.`,
        ).toBe(200);
      }
    });
  }
});
