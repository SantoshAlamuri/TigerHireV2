import { describe, it, expect } from "vitest";
import {
  signDemoAccessToken,
  verifyDemoAccessToken,
  DEMO_TOKEN_TTL_SEC,
  demoOtpSendSchema,
  demoOtpVerifySchema,
} from "@/lib/agents/demo-otp";

describe("demo access token", () => {
  it("round-trips the verified phone", () => {
    const token = signDemoAccessToken("919876543210");
    expect(verifyDemoAccessToken(token)).toBe("919876543210");
  });

  it("rejects tampered tokens", () => {
    const token = signDemoAccessToken("919876543210");
    const [h, p, s] = token.split(".");
    const otherBody = Buffer.from(JSON.stringify({ ph: "911111111111", exp: 9999999999 }))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(verifyDemoAccessToken(`${h}.${otherBody}.${s}`)).toBeNull();
    expect(verifyDemoAccessToken(`${h}.${p}.AAAA`)).toBeNull();
    expect(verifyDemoAccessToken("garbage")).toBeNull();
  });

  it("expires after the TTL", () => {
    const now = Date.now();
    const token = signDemoAccessToken("919876543210", now);
    const afterExpiry = now + (DEMO_TOKEN_TTL_SEC + 60) * 1000;
    expect(verifyDemoAccessToken(token, afterExpiry)).toBeNull();
    expect(verifyDemoAccessToken(token, now + 1000)).toBe("919876543210");
  });
});

describe("demo otp schemas", () => {
  it("bounds phone and code inputs", () => {
    expect(demoOtpSendSchema.safeParse({ phone: "98765 43210" }).success).toBe(true);
    expect(demoOtpSendSchema.safeParse({ phone: "12" }).success).toBe(false);
    expect(demoOtpVerifySchema.safeParse({ phone: "9876543210", code: "123456" }).success).toBe(
      true,
    );
    expect(demoOtpVerifySchema.safeParse({ phone: "9876543210", code: "12" }).success).toBe(false);
  });
});
