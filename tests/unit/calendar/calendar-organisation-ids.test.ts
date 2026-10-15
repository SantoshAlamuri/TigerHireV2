import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveCalendarOrganisationIds } from "@/lib/calendar/calendar-organisation-ids";

const mockFrom = vi.fn();

describe("resolveCalendarOrganisationIds", () => {
  beforeEach(() => {
    mockFrom.mockReset();
  });

  it("returns only own org for hiring_manager", async () => {
    const supabase = { from: mockFrom } as never;
    const ids = await resolveCalendarOrganisationIds(supabase, "org-a", "hiring_manager");
    expect(ids).toEqual(["org-a"]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("includes client orgs for agency users", async () => {
    mockFrom.mockImplementation(() => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [{ client_organisation_id: "client-1" }, { client_organisation_id: "client-2" }],
            error: null,
          }),
      }),
    }));

    const supabase = { from: mockFrom } as never;
    const ids = await resolveCalendarOrganisationIds(supabase, "agency-org", "agency");
    expect(ids).toEqual(expect.arrayContaining(["agency-org", "client-1", "client-2"]));
    expect(ids).toHaveLength(3);
  });
});
