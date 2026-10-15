import { describe, expect, it } from "vitest";
import {
  clashes,
  expandWorkingHours,
  findPanelSlots,
  intersectAll,
  localDay,
  mergeIntervals,
  subtractIntervals,
  zoneOffsetMinutes,
  DEFAULT_WORKING_HOURS,
} from "@/lib/calendar/slots";

const t = (iso: string) => Date.parse(iso);
const iv = (a: string, b: string) => ({ start: t(a), end: t(b) });

describe("interval maths", () => {
  it("merges overlaps and touching ranges", () => {
    expect(
      mergeIntervals([
        iv("2026-10-19T05:00:00Z", "2026-10-19T06:00:00Z"),
        iv("2026-10-19T06:00:00Z", "2026-10-19T07:00:00Z"),
        iv("2026-10-19T09:00:00Z", "2026-10-19T10:00:00Z"),
      ]),
    ).toEqual([
      iv("2026-10-19T05:00:00Z", "2026-10-19T07:00:00Z"),
      iv("2026-10-19T09:00:00Z", "2026-10-19T10:00:00Z"),
    ]);
  });

  it("subtracts busy time from free time", () => {
    expect(
      subtractIntervals(
        [iv("2026-10-19T04:30:00Z", "2026-10-19T12:30:00Z")],
        [iv("2026-10-19T06:00:00Z", "2026-10-19T07:00:00Z")],
      ),
    ).toEqual([
      iv("2026-10-19T04:30:00Z", "2026-10-19T06:00:00Z"),
      iv("2026-10-19T07:00:00Z", "2026-10-19T12:30:00Z"),
    ]);
  });

  it("intersects several people's free time", () => {
    expect(
      intersectAll([
        [iv("2026-10-19T04:00:00Z", "2026-10-19T08:00:00Z")],
        [iv("2026-10-19T06:00:00Z", "2026-10-19T10:00:00Z")],
      ]),
    ).toEqual([iv("2026-10-19T06:00:00Z", "2026-10-19T08:00:00Z")]);
  });
});

describe("time zones", () => {
  it("knows IST is +5:30 and London moves with summer time", () => {
    expect(zoneOffsetMinutes(t("2026-10-19T00:00:00Z"), "Asia/Kolkata")).toBe(330);
    expect(zoneOffsetMinutes(t("2026-07-01T12:00:00Z"), "Europe/London")).toBe(60);
    expect(zoneOffsetMinutes(t("2026-12-01T12:00:00Z"), "Europe/London")).toBe(0);
  });

  it("gets the local day right across midnight", () => {
    // 20:00 UTC Sunday is 01:30 Monday in India.
    expect(localDay(t("2026-10-18T20:00:00Z"), "Asia/Kolkata")).toEqual({
      key: "2026-10-19",
      weekday: 1,
    });
  });

  it("expands 10-6 IST weekdays into UTC", () => {
    const out = expandWorkingHours(
      DEFAULT_WORKING_HOURS,
      t("2026-10-17T00:00:00Z"), // Saturday
      t("2026-10-20T00:00:00Z"), // Tuesday 00:00 UTC
    );
    expect(out).toEqual([iv("2026-10-19T04:30:00Z", "2026-10-19T12:30:00Z")]);
  });
});

describe("findPanelSlots", () => {
  const base = {
    from: t("2026-10-19T00:00:00Z"),
    to: t("2026-10-20T00:00:00Z"),
    durationMinutes: 45,
    bufferMinutes: 0,
    stepMinutes: 30,
    minNoticeMinutes: 0,
    now: t("2026-10-18T00:00:00Z"),
    maxPerDay: 50,
    timeZone: "Asia/Kolkata",
  };
  const day = [iv("2026-10-19T04:30:00Z", "2026-10-19T12:30:00Z")];

  it("only offers times the whole panel is free", () => {
    const slots = findPanelSlots(
      [
        { userId: "a", available: day, busy: [iv("2026-10-19T04:30:00Z", "2026-10-19T11:00:00Z")] },
        { userId: "b", available: day, busy: [iv("2026-10-19T11:45:00Z", "2026-10-19T12:30:00Z")] },
      ],
      base,
    );
    expect(slots).toEqual([iv("2026-10-19T11:00:00Z", "2026-10-19T11:45:00Z")]);
  });

  it("keeps a buffer around meetings", () => {
    const slots = findPanelSlots(
      [{ userId: "a", available: day, busy: [iv("2026-10-19T05:00:00Z", "2026-10-19T12:00:00Z")] }],
      { ...base, bufferMinutes: 15 },
    );
    // Before: 04:30 + 45 = 05:15, but 15 min buffer needs end by 04:45. Nothing fits before.
    expect(slots).toEqual([]);
  });

  it("respects minimum notice", () => {
    const slots = findPanelSlots([{ userId: "a", available: day, busy: [] }], {
      ...base,
      now: t("2026-10-19T10:10:00Z"),
      minNoticeMinutes: 60,
    });
    expect(slots[0].start).toBe(t("2026-10-19T11:30:00Z"));
  });

  it("spreads a limited number of picks across the day without overlaps", () => {
    const slots = findPanelSlots([{ userId: "a", available: day, busy: [] }], {
      ...base,
      maxPerDay: 3,
    });
    expect(slots).toHaveLength(3);
    expect(slots[0].start).toBe(t("2026-10-19T04:30:00Z"));
    expect(slots[2].end).toBe(t("2026-10-19T12:15:00Z"));
    for (let i = 1; i < slots.length; i++)
      expect(slots[i].start).toBeGreaterThanOrEqual(slots[i - 1].end);
  });

  it("detects a clash with something booked later", () => {
    const slot = iv("2026-10-19T06:00:00Z", "2026-10-19T06:45:00Z");
    expect(clashes(slot, [iv("2026-10-19T06:30:00Z", "2026-10-19T07:00:00Z")])).toBe(true);
    expect(clashes(slot, [iv("2026-10-19T06:45:00Z", "2026-10-19T07:00:00Z")])).toBe(false);
    expect(clashes(slot, [iv("2026-10-19T06:45:00Z", "2026-10-19T07:00:00Z")], 10)).toBe(true);
  });
});
