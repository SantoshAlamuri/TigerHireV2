import { describe, expect, it } from "vitest";
import { offerTemplateBodyToPdfPlainText } from "@/lib/offers/offer-template-html-to-plain";

describe("offerTemplateBodyToPdfPlainText", () => {
  it("leaves legacy plain text unchanged", () => {
    const plain = "Hello {{candidate_name}}\n\nSecond line.";
    expect(offerTemplateBodyToPdfPlainText(plain)).toBe(plain);
  });

  it("strips simple HTML paragraphs and br", () => {
    const html = "<p>Dear {{candidate_name}},</p><p>Welcome to <strong>Acme</strong>.</p>";
    const out = offerTemplateBodyToPdfPlainText(html);
    expect(out).toContain("Dear {{candidate_name}},");
    expect(out).toContain("Welcome to Acme");
    expect(out).not.toContain("<p>");
  });

  it("preserves merge tokens inside markup", () => {
    const html = "<p>{{company_name}}</p><p>Role: {{role_title}}</p>";
    expect(offerTemplateBodyToPdfPlainText(html)).toContain("{{company_name}}");
    expect(offerTemplateBodyToPdfPlainText(html)).toContain("{{role_title}}");
  });

  it("turns horizontal rules into a plain divider line", () => {
    const html = "<p>Before</p><hr /><p>After</p>";
    const out = offerTemplateBodyToPdfPlainText(html);
    expect(out).toContain("Before");
    expect(out).toContain("After");
    expect(out).toMatch(/─{3,}/);
  });
});
