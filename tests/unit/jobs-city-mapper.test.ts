import { describe, expect, it } from "vitest";
import { mapCityFromLocation } from "@/lib/jobs/city-mapper";

describe("mapCityFromLocation", () => {
  it("maps remote variants first", () => {
    expect(mapCityFromLocation("Bangalore (Remote)")).toBe("remote");
    expect(mapCityFromLocation("Work From Home - India")).toBe("remote");
  });

  it("maps curated metros", () => {
    expect(mapCityFromLocation("Bengaluru, Karnataka")).toBe("bangalore");
    expect(mapCityFromLocation("Gurugram, India")).toBe("delhi_ncr");
    expect(mapCityFromLocation("Mumbai, Maharashtra")).toBe("mumbai");
    expect(mapCityFromLocation("Hyderabad")).toBe("hyderabad");
    expect(mapCityFromLocation("Chennai")).toBe("chennai");
    expect(mapCityFromLocation("Pune")).toBe("pune");
  });

  it("drops non-curated and non-india locations", () => {
    expect(mapCityFromLocation("Jaipur, Rajasthan")).toBeNull();
    expect(mapCityFromLocation("San Francisco, USA")).toBeNull();
  });
});
