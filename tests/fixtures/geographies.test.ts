import { demoPrayerTimes } from "@prophetic-night/prayer-providers";
import { calculateNightSegments, formatInstant } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";

const additional = {
  "cape-town": ["2026-05-10T17:55:00+02:00", "2026-05-11T05:38:00+02:00", "Africa/Johannesburg"],
  "new-york": ["2026-03-07T17:52:00-05:00", "2026-03-08T05:12:00-04:00", "America/New_York"],
} as const;

describe("fixed geographic scenarios", () => {
  it.each([...Object.entries(demoPrayerTimes), ...Object.entries(additional)])(
    "calculates %s deterministically",
    (_name, value) => {
      const fixture = Array.isArray(value)
        ? { maghrib: value[0], fajr: value[1], timeZone: value[2] }
        : value;
      const result = calculateNightSegments(fixture);
      expect(result.segments).toHaveLength(6);
      expect(formatInstant(result.night.start, { timeZone: fixture.timeZone })).not.toBe("");
    },
  );
});
