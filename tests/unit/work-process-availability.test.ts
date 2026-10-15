import { describe, expect, it } from "vitest";
import { splitStages, toPayload, stagesProblem, move, type StageRow } from "@/lib/work/process";
import { planWeek, weekProblem, groupByDay } from "@/lib/work/availability";
import { parseEmails } from "@/lib/work/team";

const seeded: StageRow[] = [
  { id: "a", stage_name: "Applied", stage_order: 0, stage_type: "system_auto", is_locked: true },
  {
    id: "f",
    stage_name: "FitScore Review",
    stage_order: 1,
    stage_type: "system_auto",
    is_locked: true,
  },
  {
    id: "s",
    stage_name: "Shortlisted",
    stage_order: 2,
    stage_type: "screening",
    is_locked: false,
    sla_days: 3,
    notify_email_body: "Hi",
  },
  { id: "i", stage_name: "Interview", stage_order: 3, stage_type: "interview", is_locked: false },
  { id: "h", stage_name: "Hired", stage_order: 4, stage_type: "terminal_hired", is_locked: true },
  {
    id: "r",
    stage_name: "Rejected",
    stage_order: 5,
    stage_type: "terminal_reject",
    is_locked: true,
  },
];

describe("hiring process stages", () => {
  it("splits into a fixed start, your middle and fixed outcomes", () => {
    const b = splitStages(seeded);
    expect(b.start.map((s) => s.stage_name)).toEqual(["Applied", "FitScore Review"]);
    expect(b.middle.map((s) => s.name)).toEqual(["Shortlisted", "Interview"]);
    expect(b.end.map((s) => s.stage_name)).toEqual(["Hired", "Rejected"]);
  });

  it("saves nothing for the fixed start and leaves unmoved outcomes alone", () => {
    const payload = toPayload(splitStages(seeded));
    expect(payload.map((p) => p.stage_name)).toEqual(["Shortlisted", "Interview"]);
  });

  it("keeps settings the screen doesn't show, like SLA and the candidate email", () => {
    const [first] = toPayload(splitStages(seeded));
    expect(first).toMatchObject({ id: "s", sla_days: 3, notify_email_body: "Hi", stage_order: 2 });
  });

  it("moves the outcomes down when a stage is added", () => {
    const b = splitStages(seeded);
    b.middle.push({ key: "n", name: "Final round", type: "interview" });
    const payload = toPayload(b);
    expect(payload.find((p) => p.stage_name === "Final round")).toMatchObject({ stage_order: 4 });
    expect(payload.find((p) => p.stage_name === "Hired")).toMatchObject({
      id: "h",
      stage_order: 5,
    });
    expect(payload.find((p) => p.stage_name === "Rejected")).toMatchObject({ stage_order: 6 });
  });

  it("reorders and checks names", () => {
    const b = splitStages(seeded);
    expect(move(b.middle, 0, 1).map((s) => s.name)).toEqual(["Interview", "Shortlisted"]);
    expect(stagesProblem({ ...b, middle: [{ key: "x", name: " ", type: "interview" }] })).toMatch(
      /name/,
    );
    expect(stagesProblem({ ...b, middle: [] })).toMatch(/at least one/);
  });
});

describe("usual week", () => {
  // Wednesday 1 Jan 2031, 09:00 local.
  const now = new Date(2031, 0, 1, 9, 0, 0);

  it("lays the week out over the next weeks, skipping today's past hours", () => {
    const plan = planWeek({ days: [1, 2, 3, 4, 5], from: "08:00", to: "10:00", weeks: 1 }, [], now);
    // Wed 08:00 has already started, so Thu, Fri, Mon, Tue.
    expect(plan.map((p) => new Date(p.starts_at).getDay())).toEqual([4, 5, 1, 2]);
  });

  it("skips days that already have time set", () => {
    const thu = {
      starts_at: new Date(2031, 0, 2, 9).toISOString(),
      ends_at: new Date(2031, 0, 2, 11).toISOString(),
    };
    const plan = planWeek({ days: [4], from: "10:00", to: "17:00", weeks: 1 }, [thu], now);
    expect(plan).toHaveLength(0);
  });

  it("explains an impossible week", () => {
    expect(weekProblem({ days: [], from: "10:00", to: "17:00", weeks: 1 })).toMatch(/day/);
    expect(weekProblem({ days: [1], from: "17:00", to: "10:00", weeks: 1 })).toMatch(/after/);
  });

  it("groups upcoming times by day and drops past ones", () => {
    const groups = groupByDay(
      [
        {
          id: "1",
          starts_at: new Date(2031, 0, 2, 10).toISOString(),
          ends_at: new Date(2031, 0, 2, 12).toISOString(),
        },
        {
          id: "2",
          starts_at: new Date(2031, 0, 2, 14).toISOString(),
          ends_at: new Date(2031, 0, 2, 16).toISOString(),
        },
        {
          id: "3",
          starts_at: new Date(2030, 11, 1, 10).toISOString(),
          ends_at: new Date(2030, 11, 1, 12).toISOString(),
        },
      ],
      now,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].windows.map((w) => w.id)).toEqual(["1", "2"]);
  });
});

describe("invite emails", () => {
  it("takes commas, spaces and new lines, and flags typos", () => {
    expect(parseEmails("a@x.com, B@x.com\nnot-an-email a@x.com")).toEqual({
      valid: ["a@x.com", "b@x.com"],
      invalid: ["not-an-email"],
    });
  });
});
