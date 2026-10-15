import { describe, expect, it } from "vitest";
import { normalizeReplyText } from "@/lib/whatsapp/normalize-reply";

describe("normalizeReplyText", () => {
  it("returns trimmed text body for type text", () => {
    expect(
      normalizeReplyText({
        type: "text",
        text: { body: "  YES  " },
      }),
    ).toBe("YES");
  });

  it("returns empty string for text type with no body", () => {
    expect(normalizeReplyText({ type: "text" })).toBe("");
  });

  it("reads interactive button_reply title", () => {
    expect(
      normalizeReplyText({
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "yes", title: "Yes" },
        },
      }),
    ).toBe("Yes");
  });

  it("reads interactive list_reply title", () => {
    expect(
      normalizeReplyText({
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "no", title: "No" },
        },
      }),
    ).toBe("No");
  });

  it("reads legacy button.text", () => {
    expect(
      normalizeReplyText({
        type: "button",
        button: { text: "NO" },
      }),
    ).toBe("NO");
  });

  it("prefers button_reply over list_reply when both set", () => {
    expect(
      normalizeReplyText({
        type: "interactive",
        interactive: {
          button_reply: { title: "Yes" },
          list_reply: { title: "No" },
        },
      }),
    ).toBe("Yes");
  });

  it("returns empty for non-text types with no tap payload", () => {
    expect(normalizeReplyText({ type: "image" })).toBe("");
  });
});
