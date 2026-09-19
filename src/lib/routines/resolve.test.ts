import { calculateNightSegments } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";
import { resolveRoutineOccurrence } from "./resolve";
import { validateRoutine, type Routine } from "./model";
const routine: Routine = {
  id: "routine-one",
  name: "Adhkar",
  type: "dhikr",
  enabled: true,
  durationMinutes: 15,
  recurrence: "daily",
  timing: { kind: "relative", anchor: "asr", offsetMinutes: 15 },
  createdAt: "",
  updatedAt: "",
};
const base = {
  routine,
  localDate: "2026-09-19",
  timezone: "Europe/London",
  prayerSchedule: { asr: "2026-09-19T15:05:00Z" },
};
describe("relative routine resolution", () => {
  it.each([
    ["night_midpoint", 3],
    ["last_third_start", 4],
    ["final_sixth_start", 5],
  ] as const)("uses engine boundary for %s and preserves Maghrib date", (anchor, index) => {
    const nightSchedule = calculateNightSegments({
      maghrib: "2026-09-19T18:00:00Z",
      fajr: "2026-09-20T06:00:00Z",
      timeZone: "UTC",
    });
    const result = resolveRoutineOccurrence({
      ...base,
      timezone: "UTC",
      nightSchedule,
      routine: { ...routine, timing: { kind: "relative", anchor, offsetMinutes: 0 } },
    })!;
    expect(Date.parse(result.start)).toBe(Date.parse(nightSchedule.boundaries[index]!.instant));
    expect(result.localDate).toBe("2026-09-19");
  });

  it.each([0, 15, -30])("applies signed elapsed offset %s", (offsetMinutes) => {
    const result = resolveRoutineOccurrence({
      ...base,
      routine: { ...routine, timing: { kind: "relative", anchor: "asr", offsetMinutes } },
    })!;
    expect(Date.parse(result.start) - Date.parse(result.anchorResolvedAt)).toBe(
      offsetMinutes * 60000,
    );
    expect(Date.parse(result.end) - Date.parse(result.start)).toBe(900000);
  });
  it("preserves identity when a dependency moves", () => {
    const first = resolveRoutineOccurrence(base)!;
    const second = resolveRoutineOccurrence({
      ...base,
      prayerSchedule: { asr: "2026-09-19T15:03:00Z" },
    })!;
    expect(second.logicalOccurrenceId).toBe(first.logicalOccurrenceId);
    expect(second.start).toBe("2026-09-19T15:18:00Z");
  });
  it.each([
    ["fajr", "2026-09-18T23:10:00Z", -20, "2026-09-18T22:50:00Z"],
    ["isha", "2026-09-19T22:50:00Z", 30, "2026-09-19T23:20:00Z"],
  ] as const)(
    "crosses civil midnight for %s without changing service date",
    (anchor, instant, offsetMinutes, expected) => {
      const result = resolveRoutineOccurrence({
        ...base,
        routine: { ...routine, timing: { kind: "relative", anchor, offsetMinutes } },
        prayerSchedule: { [anchor]: instant },
      })!;
      expect(result.start).toBe(expected);
      expect(result.localDate).toBe(base.localDate);
    },
  );
  it("rejects missing and wrong-date anchors", () => {
    expect(() => resolveRoutineOccurrence({ ...base, prayerSchedule: {} })).toThrow(
      "MISSING_ANCHOR",
    );
    expect(() => resolveRoutineOccurrence({ ...base, localDate: "2026-09-20" })).toThrow(
      "INVALID_ANCHOR",
    );
  });
  it("resolves personal bedtime in the supplied zone", () => {
    expect(
      resolveRoutineOccurrence({
        ...base,
        routine: {
          ...routine,
          timing: { kind: "relative", anchor: "bedtime", offsetMinutes: -20 },
        },
        personalAnchors: { bedtime: "23:00" },
      })?.start,
    ).toBe("2026-09-19T21:40:00Z");
  });
  it.each(["2026-03-29", "2026-10-25"])(
    "rejects ambiguous or nonexistent local clocks on %s",
    (localDate) => {
      expect(() =>
        resolveRoutineOccurrence({
          ...base,
          localDate,
          routine: { ...routine, timing: { kind: "fixed", time: "01:30" } },
        }),
      ).toThrow("INVALID_ROUTINE_CONTEXT");
    },
  );
  it("applies offsets across DST as elapsed minutes", () => {
    expect(
      resolveRoutineOccurrence({
        ...base,
        localDate: "2026-03-29",
        prayerSchedule: { asr: "2026-03-29T00:50:00Z" },
        routine: { ...routine, timing: { kind: "relative", anchor: "asr", offsetMinutes: 30 } },
      })?.start,
    ).toBe("2026-03-29T01:20:00Z");
  });
  it("skips disabled and weekend weekday routines", () => {
    expect(
      resolveRoutineOccurrence({ ...base, routine: { ...routine, enabled: false } }),
    ).toBeNull();
    expect(
      resolveRoutineOccurrence({ ...base, routine: { ...routine, recurrence: "weekdays" } }),
    ).toBeNull();
  });
  it.each([
    { kind: "fixed", time: "25:00" },
    { kind: "nonsense" },
    { kind: "relative", anchor: "unknown", offsetMinutes: 0 },
  ])("rejects malformed timing %j", (timing) => {
    expect(() => validateRoutine({ ...routine, timing: timing as Routine["timing"] })).toThrow(
      "INVALID_ROUTINE",
    );
  });
});
