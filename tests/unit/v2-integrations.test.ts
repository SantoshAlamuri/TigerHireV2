import { describe, it, expect } from "vitest";
import { INTEGRATIONS, actionsFor, integrationsFor } from "@/lib/v2/integrations";

/**
 * Two kinds of integration, and they must never be presented the same way:
 *
 *  - PLATFORM-managed: TigerHire runs the account, the credentials and the
 *    infrastructure. A customer may switch it on or off for their org and
 *    nothing else. Showing them a key field would be a lie at best and a
 *    support incident at worst.
 *  - CUSTOMER-owned: their own account (their job board seat, their webhook
 *    endpoint). They configure it fully, because it is theirs.
 */
describe("integration registry", () => {
  it("declares an owner for every integration — no ambiguous middle", () => {
    for (const i of INTEGRATIONS) {
      expect(["platform", "customer"]).toContain(i.owner);
      expect(i.name.length).toBeGreaterThan(0);
      expect(i.purpose.length).toBeGreaterThan(0);
    }
  });

  it("keeps the core channels platform-managed", () => {
    const byId = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i]));
    expect(byId.whatsapp.owner).toBe("platform");
    expect(byId.email.owner).toBe("platform");
    expect(byId.scoring.owner).toBe("platform");
  });

  it("keeps the customer's own accounts customer-owned", () => {
    const byId = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i]));
    expect(byId.job_boards.owner).toBe("customer");
    expect(byId.webhooks.owner).toBe("customer");
  });
});

describe("actionsFor", () => {
  it("gives a platform integration exactly one control: on or off", () => {
    const a = actionsFor("whatsapp", "leadership");
    expect(a.canToggle).toBe(true);
    expect(a.canConfigure).toBe(false);
    expect(a.canViewCredentials).toBe(false);
    expect(a.note).toMatch(/managed by TigerHire/i);
  });

  it("never lets even an owner configure a platform integration", () => {
    for (const seat of ["leadership", "super_admin", "recruiter"]) {
      expect(actionsFor("scoring", seat).canConfigure).toBe(false);
      expect(actionsFor("scoring", seat).canViewCredentials).toBe(false);
    }
  });

  it("lets the account owner fully configure their own integrations", () => {
    const a = actionsFor("job_boards", "leadership");
    expect(a.canToggle).toBe(true);
    expect(a.canConfigure).toBe(true);
  });

  it("does not let a recruiter reconfigure the org's own accounts", () => {
    const a = actionsFor("webhooks", "recruiter");
    expect(a.canConfigure).toBe(false);
    // But they can still see that it is on, because a dead webhook affects them.
    expect(a.canView).toBe(true);
  });

  it("does not let a recruiter switch a platform channel off for the whole org", () => {
    expect(actionsFor("whatsapp", "recruiter").canToggle).toBe(false);
    expect(actionsFor("whatsapp", "recruiter").canView).toBe(true);
  });

  it("hides everything from seats with no integration visibility", () => {
    for (const seat of ["hiring_manager", "agency", undefined]) {
      const a = actionsFor("whatsapp", seat);
      expect(a.canView).toBe(false);
      expect(a.canToggle).toBe(false);
      expect(a.canConfigure).toBe(false);
    }
  });

  it("is safe for an unknown integration id", () => {
    const a = actionsFor("nope", "leadership");
    expect(a.canView).toBe(false);
    expect(a.canToggle).toBe(false);
    expect(a.canConfigure).toBe(false);
  });
});

describe("integrationsFor", () => {
  it("returns nothing for a seat that cannot see integrations", () => {
    expect(integrationsFor("hiring_manager")).toEqual([]);
    expect(integrationsFor("agency")).toEqual([]);
  });

  it("returns every integration with its resolved actions for an owner", () => {
    const rows = integrationsFor("leadership");
    expect(rows.length).toBe(INTEGRATIONS.length);
    const whatsapp = rows.find((r) => r.id === "whatsapp");
    expect(whatsapp?.actions.canToggle).toBe(true);
    expect(whatsapp?.actions.canConfigure).toBe(false);
  });

  it("shows a recruiter the same list, read-only", () => {
    const rows = integrationsFor("recruiter");
    expect(rows.length).toBe(INTEGRATIONS.length);
    expect(rows.every((r) => r.actions.canConfigure === false)).toBe(true);
    expect(rows.every((r) => r.actions.canToggle === false)).toBe(true);
  });
});

// ── Never claim a status we did not check ───────────────────────────────────
// The page used to render "On" for every integration unconditionally. If
// WhatsApp were down it would still have said On. A status nobody verified is
// worse than no status, because it gets believed.

import { statusFor } from "@/lib/v2/integrations";

describe("statusFor", () => {
  it("reports unknown when nothing has actually been checked", () => {
    const s = statusFor("whatsapp");
    expect(s.known).toBe(false);
    expect(s.label).toBe("Not checked here");
  });

  it("never returns a connected-sounding label without a check", () => {
    for (const id of INTEGRATIONS.map((i) => i.id)) {
      const s = statusFor(id);
      if (!s.known) {
        expect(s.label.toLowerCase()).not.toContain("on");
        expect(s.label.toLowerCase()).not.toContain("connected");
        expect(s.label.toLowerCase()).not.toContain("healthy");
      }
    }
  });

  it("points at somewhere status can genuinely be confirmed, when one exists", () => {
    // WhatsApp has a real health page in the product; most integrations do not.
    expect(statusFor("whatsapp").verifyHref).toBe("/admin/whatsapp-health");
    expect(statusFor("scoring").verifyHref).toBeNull();
  });

  it("is safe for an unknown integration id", () => {
    const s = statusFor("nope");
    expect(s.known).toBe(false);
    expect(s.verifyHref).toBeNull();
  });
});
