import { describe, expect, it } from "vitest";
import { getInngestCredentials } from "@/inngest/credentials";

describe("getInngestCredentials", () => {
  it("prefers standard SDK credentials when both forms exist", () => {
    expect(
      getInngestCredentials({
        INNGEST_EVENT_KEY: "legacy-event",
        INNGEST_SIGNING_KEY: "legacy-signing",
        tigerhire_INNGEST_EVENT_KEY: "integration-event",
        tigerhire_INNGEST_SIGNING_KEY: "integration-signing",
      }),
    ).toMatchObject({
      eventKey: "legacy-event",
      signingKey: "legacy-signing",
    });
  });

  it("falls back to standard Inngest variable names", () => {
    expect(
      getInngestCredentials({
        INNGEST_EVENT_KEY: "standard-event",
        INNGEST_SIGNING_KEY: "standard-signing",
      }),
    ).toMatchObject({ eventKey: "standard-event", signingKey: "standard-signing" });
  });

  it("uses Vercel integration-managed names as a fallback", () => {
    expect(
      getInngestCredentials({
        tigerhire_INNGEST_EVENT_KEY: "integration-event",
        tigerhire_INNGEST_SIGNING_KEY: "integration-signing",
      }),
    ).toMatchObject({ eventKey: "integration-event", signingKey: "integration-signing" });
  });
});
