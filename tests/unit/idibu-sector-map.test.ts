import { describe, expect, it } from "vitest";
import { mapRoleCategoryToIdibuSector } from "@/lib/integrations/idibu/sector-map";

describe("mapRoleCategoryToIdibuSector", () => {
  it("maps known role categories", () => {
    expect(mapRoleCategoryToIdibuSector("engineering", "99")).toBe("1");
    expect(mapRoleCategoryToIdibuSector("Sales", "99")).toBe("5");
    expect(mapRoleCategoryToIdibuSector("customer success", "99")).toBe("9");
  });

  it("returns fallback for unknown or empty category", () => {
    expect(mapRoleCategoryToIdibuSector(null, "7")).toBe("7");
    expect(mapRoleCategoryToIdibuSector("  ", "7")).toBe("7");
    expect(mapRoleCategoryToIdibuSector("legal", "3")).toBe("3");
  });
});
