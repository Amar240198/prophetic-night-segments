import "fake-indexeddb/auto";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";
import { createCalendarContents, createNightEndSchedule } from "./ScheduleTools";

describe("calendar export", () => {
  const result = calculateNightSegments({
    maghrib: "2026-01-01T18:00:00Z",
    fajr: "2026-01-02T05:30:00Z",
    timeZone: "UTC",
  });

  it("includes an enabled Wake before Fajr reminder relative to following Fajr", async () => {
    const calendar = await createCalendarContents(result, {}, 30);

    expect(calendar).toContain("SUMMARY:Wake before Fajr");
    expect(calendar).toContain("DTSTART:20260102T050000Z");
  });

  it("shows one active buffer and uses the selected buffer minutes", () => {
    const selected = createNightEndSchedule(result, 20, 30);
    expect(selected.map((event) => event.label)).toEqual(["Buffer Before Fajr", "Fajr"]);
    expect(selected[0]?.instant).toBe("2026-01-02T05:00:00.000Z");

    const defaulted = createNightEndSchedule(result, 20, null);
    expect(defaulted.map((event) => event.label)).toEqual(["Buffer Wake-Up Time", "Fajr"]);
  });

  it("omits the Wake before Fajr reminder when it is off", async () => {
    expect(await createCalendarContents(result, {}, null)).not.toContain("Wake before Fajr");
  });

  it("orders the end-of-night schedule chronologically and retains coincident events", () => {
    const resultWithWakeBuffer = calculateNightSegments({
      maghrib: "2026-01-01T18:00:00Z",
      fajr: "2026-01-02T05:30:00Z",
      timeZone: "UTC",
      fajrWakeBufferMinutes: 60,
    });
    const schedule = createNightEndSchedule(resultWithWakeBuffer, 30, 30);

    expect(schedule.map((event) => event.label)).toEqual(["Buffer Before Fajr", "Fajr"]);
    expect(schedule[0]!.instant).toBe("2026-01-02T05:00:00.000Z");
    expect(schedule.at(-1)).toMatchObject({
      label: "Fajr",
      instant: resultWithWakeBuffer.night.end,
    });
  });
});
