import { describe, it, expect } from "vitest";
import {
  consultantInviteCreateSchema,
  consultantInviteUsability,
  CONSULTANT_INVITE_TTL_DAYS,
} from "@/lib/validations/consultant-invites";
import { consultantInviteHtml, consultantInviteUrl } from "@/lib/consultants/invite-email";

const future = () => new Date(Date.now() + 60_000).toISOString();
const past = () => new Date(Date.now() - 60_000).toISOString();

describe("consultantInviteCreateSchema", () => {
  it("normalises the email to lowercase and trims it", () => {
    const parsed = consultantInviteCreateSchema.parse({ email: "  Partner@Firm.COM " });
    expect(parsed.email).toBe("partner@firm.com");
  });

  it("rejects a malformed email", () => {
    expect(consultantInviteCreateSchema.safeParse({ email: "not-an-email" }).success).toBe(false);
  });

  it("accepts an optional firm name and note", () => {
    const parsed = consultantInviteCreateSchema.parse({
      email: "a@b.com",
      agencyName: "Acme Talent",
      note: "Backend roles this quarter",
    });
    expect(parsed.agencyName).toBe("Acme Talent");
    expect(parsed.note).toBe("Backend roles this quarter");
  });

  it("rejects an over-long note rather than silently truncating", () => {
    const result = consultantInviteCreateSchema.safeParse({
      email: "a@b.com",
      note: "x".repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe("consultantInviteUsability", () => {
  it("treats a pending, unexpired invite as usable", () => {
    expect(consultantInviteUsability({ status: "pending", expires_at: future() })).toEqual({
      usable: true,
    });
  });

  it("rejects a pending invite whose expiry has passed", () => {
    // The status column can lag behind the clock — nothing sweeps it — so expiry
    // must be judged on the timestamp, not on status alone.
    expect(consultantInviteUsability({ status: "pending", expires_at: past() })).toEqual({
      usable: false,
      reason: "expired",
    });
  });

  it.each([
    ["accepted", "accepted"],
    ["revoked", "revoked"],
    ["expired", "expired"],
  ])("rejects a %s invite even when unexpired", (status, reason) => {
    expect(consultantInviteUsability({ status, expires_at: future() })).toEqual({
      usable: false,
      reason,
    });
  });

  it("keeps a two-week default TTL", () => {
    expect(CONSULTANT_INVITE_TTL_DAYS).toBe(14);
  });
});

describe("consultantInviteHtml", () => {
  it("embeds the accept link for the token", () => {
    const html = consultantInviteHtml({
      companyName: "Acme",
      inviterName: "Priya",
      token: "abc123",
    });
    expect(html).toContain(consultantInviteUrl("abc123"));
    expect(consultantInviteUrl("abc123")).toContain("/consultant-invite/abc123");
  });

  it("escapes company, inviter and note so a crafted name cannot inject markup", () => {
    const html = consultantInviteHtml({
      companyName: '<script>alert("x")</script>',
      inviterName: "<b>Bold</b>",
      note: '<img src=x onerror="steal()">',
      token: "t",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Bold</b>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the note block entirely when no note is given", () => {
    const html = consultantInviteHtml({ companyName: "Acme", inviterName: "Priya", token: "t" });
    expect(html).not.toContain("border-left:3px solid");
  });
});
