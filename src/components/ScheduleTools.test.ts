import { calculateNightSegments } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";
import { createCalendarContents, createNightEndSchedule } from "./ScheduleTools";

describe("calendar export", () => {
  const result = calculateNightSegments({
    maghrib: "2026-01-01T18:00:00Z",
    fajr: "2026-01-02T05:30:00Z",
    timeZone: "UTC",
  });

  it("includes an enabled First Adhan Reminder relative to following Fajr", () => {
    const calendar = createCalendarContents(result, {}, 30);

    expect(calendar).toContain("SUMMARY:First Adhan Reminder");
    expect(calendar).toContain("DTSTART:20260102T050000Z");
  });

  it("omits the First Adhan Reminder when it is off", () => {
    expect(createCalendarContents(result, {}, null)).not.toContain("First Adhan Reminder");
  });

  it("orders the end-of-night schedule chronologically and retains coincident events", () => {
    const resultWithWakeBuffer = calculateNightSegments({
      maghrib: "2026-01-01T18:00:00Z",
      fajr: "2026-01-02T05:30:00Z",
      timeZone: "UTC",
      fajrWakeBufferMinutes: 60,
    });
    const schedule = createNightEndSchedule(resultWithWakeBuffer, 30, 30);

    expect(schedule.map((event) => event.label)).toEqual([
      "Buffer Wake-Up Time",
      "Buffer Before Fajr",
      "First Adhan Reminder",
      "Fajr",
    ]);
    expect(schedule[1]!.instant).toBe(schedule[2]!.instant);
    expect(schedule.at(-1)).toMatchObject({
      label: "Fajr",
      instant: resultWithWakeBuffer.night.end,
    });
  });
});
