import { describe, expect, it } from "vitest";
import { DEFAULT_QAYLULA, parseQaylula, qaylulaRoutine, resolveQaylula } from "./qaylula";
import { validateRoutine } from "./model";
import { buildRoutineCalendarEvent } from "./occurrences";
const schedule = {
  date: "2026-10-01",
  timeZone: "UTC",
  source: "Test source",
  fajr: "2026-10-01T05:00:00Z",
  sunrise: "2026-10-01T06:00:00Z",
  dhuhr: "2026-10-01T13:00:00Z",
  asr: "2026-10-01T16:00:00Z",
  maghrib: "2026-10-01T18:00:00Z",
  isha: "2026-10-01T20:00:00Z",
};
describe("Dhuhr-relative Qaylula", () => {
  it("stores the rule, never a resolved clock time", () => {
    expect(
      qaylulaRoutine({ ...DEFAULT_QAYLULA, relation: "before", offsetMinutes: 30 }).timing,
    ).toEqual({ kind: "relative", anchor: "dhuhr", offsetMinutes: -30 });
  });
  it("resolves before Dhuhr with the selected duration", () => {
    const occurrence = resolveQaylula(
      { ...DEFAULT_QAYLULA, relation: "before", offsetMinutes: 30, durationMinutes: 20 },
      schedule,
    )!;
    expect(occurrence.start).toBe("2026-10-01T12:30:00Z");
    expect(occurrence.end).toBe("2026-10-01T12:50:00Z");
  });
  it("resolves after Dhuhr and changes with the following day's Dhuhr", () => {
    const config = { ...DEFAULT_QAYLULA, offsetMinutes: 20 };
    expect(resolveQaylula(config, schedule)?.start).toBe("2026-10-01T13:20:00Z");
    expect(
      resolveQaylula(config, { ...schedule, date: "2026-10-02", dhuhr: "2026-10-02T12:57:00Z" })
        ?.start,
    ).toBe("2026-10-02T13:17:00Z");
  });
  it("updates offset, duration, location and timezone through the supplied prayer schedule", () => {
    const result = resolveQaylula(
      { ...DEFAULT_QAYLULA, offsetMinutes: 60, durationMinutes: 45 },
      {
        ...schedule,
        source: "New location/provider",
        timeZone: "Asia/Riyadh",
        dhuhr: "2026-10-01T09:10:00Z",
      },
    )!;
    expect(result.start).toBe("2026-10-01T10:10:00Z");
    expect(result.end).toBe("2026-10-01T10:55:00Z");
    expect(result.timezone).toBe("Asia/Riyadh");
  });
  it("uses elapsed minutes across DST and permits midnight crossing", () => {
    const occurrence = resolveQaylula(
      { ...DEFAULT_QAYLULA, relation: "before", offsetMinutes: 720 },
      { ...schedule, date: "2026-10-25", timeZone: "Europe/London", dhuhr: "2026-10-25T12:00:00Z" },
    )!;
    expect(occurrence.start).toBe("2026-10-25T00:00:00Z");
  });
  it("does not resolve a disabled routine or invent missing Dhuhr", () => {
    expect(resolveQaylula({ ...DEFAULT_QAYLULA, enabled: false }, schedule)).toBeNull();
    expect(() => resolveQaylula(DEFAULT_QAYLULA, { ...schedule, dhuhr: "" })).toThrow();
  });
  it.each([
    null,
    {},
    { ...DEFAULT_QAYLULA, offsetMinutes: -1 },
    { ...DEFAULT_QAYLULA, offsetMinutes: "20" },
    { ...DEFAULT_QAYLULA, relation: "fixed" },
    { ...DEFAULT_QAYLULA, durationMinutes: 0 },
    { ...DEFAULT_QAYLULA, durationMinutes: 1.5 },
    { ...DEFAULT_QAYLULA, enabled: "yes" },
  ])("rejects invalid browser configuration %j", (value) => {
    expect(() => parseQaylula(value)).toThrow("INVALID_QAYLULA");
  });
  it("rejects other anchors at the shared routine validation boundary", () => {
    expect(() =>
      validateRoutine({
        ...qaylulaRoutine(DEFAULT_QAYLULA),
        timing: { kind: "relative", anchor: "fajr", offsetMinutes: 0 },
      }),
    ).toThrow("INVALID_ROUTINE");
  });
  it("builds an event through the existing calendar routine adapter", () => {
    const event = buildRoutineCalendarEvent({
      routine: qaylulaRoutine(DEFAULT_QAYLULA),
      localDate: schedule.date,
      timezone: schedule.timeZone,
      prayerSchedule: schedule,
    })!;
    expect(event.identityScope).toBe("routine");
    expect(event.start).toBe("2026-10-01T13:15:00Z");
    expect(event.title).toBe("Qaylula");
  });
});
