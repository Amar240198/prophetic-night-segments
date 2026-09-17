import { describe, expect, it } from "vitest";
import { buildDailyPrayerEvents } from "./buildCalendarEvents";

const schedule = {
  date: "2026-03-28",
  timeZone: "Europe/London",
  source: "test timetable",
  fajr: "05:10",
  sunrise: "06:00",
  dhuhr: "12:10",
  asr: "15:20",
  maghrib: "18:30",
  isha: "20:00",
};

describe("daily prayer calendar events", () => {
  it("creates the five obligatory events in order and excludes Sunrise", () => {
    const events = buildDailyPrayerEvents(schedule);
    expect(events.map((event) => event.id)).toEqual([
      "prayer-fajr",
      "prayer-dhuhr",
      "prayer-asr",
      "prayer-maghrib",
      "prayer-isha",
    ]);
    expect(events.every((event) => event.identityScope === "daily-prayer")).toBe(true);
    expect(events.every((event) => event.serviceDate === schedule.date)).toBe(true);
  });

  it("keeps civil prayer date stable when a timestamp changes", () => {
    const changed = buildDailyPrayerEvents({ ...schedule, fajr: "05:11" });
    expect(changed[0]!.serviceDate).toBe(schedule.date);
    expect(changed[0]!.id).toBe("prayer-fajr");
    expect(changed[0]!.start).not.toBe(buildDailyPrayerEvents(schedule)[0]!.start);
  });
});
