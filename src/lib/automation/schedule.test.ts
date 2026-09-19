import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";
import { generateAutomationSchedule, parseAutomationConfig } from "./schedule.server";
import { DEFAULT_AUTOMATION } from "./config";
import type { Routine } from "@/lib/routines/model";
const routine: Routine = {
  id: "stable",
  name: "Evening Adhkar",
  type: "dhikr",
  enabled: true,
  calendarSyncEnabled: true,
  durationMinutes: 15,
  recurrence: "daily",
  timing: { kind: "relative", anchor: "asr", offsetMinutes: 15 },
  createdAt: "",
  updatedAt: "",
};
const load = async (_source: unknown, date: string) => {
  const local = Temporal.PlainDate.from(date);
  const at = (day: Temporal.PlainDate, clock: string) =>
    day.toPlainDateTime(clock).toZonedDateTime("Europe/London").toInstant().toString();
  return {
    maghrib: at(local, "18:00"),
    fajr: at(local.add({ days: 1 }), "06:00"),
    timeZone: "Europe/London",
    source: "test",
    dailyPrayerSchedule: {
      date,
      timeZone: "Europe/London",
      source: "test",
      fajr: "06:00",
      sunrise: "07:00",
      dhuhr: "12:00",
      asr: "16:05",
      maghrib: "18:00",
      isha: "20:00",
    },
  };
};
describe("multi-day automation", () => {
  it.each([30, 60, 90])("resolves %i days across DST using each civil date", async (days) => {
    const result = await generateAutomationSchedule(
      { ...DEFAULT_AUTOMATION, modules: ["routines"] },
      [routine],
      "2026-03-20",
      days,
      load,
    );
    expect(result.issues).toEqual([]);
    expect(result.events).toHaveLength(days);
    expect(new Set(result.events.map((e) => `${e.id}/${e.serviceDate}`)).size).toBe(days);
    expect(result.events[0]?.start).toBe("2026-03-20T16:20:00Z");
    expect(result.events[10]?.start).toBe("2026-03-30T15:20:00Z");
  });
  it("resolves Friday Jumu’ah, personal bedtime, fasting conditions and night boundaries", async () => {
    const result = await generateAutomationSchedule(
      {
        ...DEFAULT_AUTOMATION,
        modules: ["routines", "night", "fasting"],
        fasting: ["monday"],
        night: "dawud",
        personalAnchors: { jumuah: "13:30", bedtime: "23:00" },
      },
      [
        {
          ...routine,
          id: "friday",
          recurrence: "friday",
          timing: { kind: "relative", anchor: "jumuah", offsetMinutes: -60 },
        },
        {
          ...routine,
          id: "bed",
          timing: { kind: "relative", anchor: "bedtime", offsetMinutes: -20 },
        },
        {
          ...routine,
          id: "suhoor",
          recurrence: "fasting-days",
          timing: { kind: "relative", anchor: "fajr", offsetMinutes: -45 },
        },
      ],
      "2026-09-18",
      7,
      load,
    );
    expect(result.issues).toEqual([]);
    expect(result.events.filter((e) => e.id === "routine-friday")).toHaveLength(1);
    expect(result.events.filter((e) => e.id === "routine-bed")).toHaveLength(7);
    expect(result.events.filter((e) => e.id === "routine-suhoor")).toHaveLength(1);
    expect(result.events.filter((e) => e.id.startsWith("dawud-"))).toHaveLength(21);
    expect(result.events.filter((e) => e.id === "fasting-monday")).toHaveLength(1);
  });
  it("surfaces missing anchors instead of making up times", async () => {
    const result = await generateAutomationSchedule(
      DEFAULT_AUTOMATION,
      [{ ...routine, timing: { kind: "relative", anchor: "bedtime", offsetMinutes: 0 } }],
      "2026-09-19",
      1,
      load,
    );
    expect(result.issues[0]?.code).toBe("ROUTINE_ANCHOR_UNAVAILABLE");
    expect(result.events.some((e) => e.id === "routine-stable")).toBe(false);
  });
  it("validates settings and forbids arbitrary calendar writes", () => {
    expect(parseAutomationConfig(DEFAULT_AUTOMATION)).toEqual(DEFAULT_AUTOMATION);
    expect(() =>
      parseAutomationConfig({ ...DEFAULT_AUTOMATION, calendarId: "someone-else" }),
    ).toThrow();
    expect(() =>
      parseAutomationConfig({ ...DEFAULT_AUTOMATION, personalAnchors: { bedtime: "25:99" } }),
    ).toThrow();
  });
});
