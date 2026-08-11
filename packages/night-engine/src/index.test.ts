import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateNightSegments,
  createAlarmPlan,
  formatInstant,
  validateNightInput,
} from "./index";
import type { NightCalculationInput } from "@prophetic-night/shared-types";

const base = {
  maghrib: "2026-01-01T18:00:00.000Z",
  fajr: "2026-01-02T00:00:00.000Z",
  timeZone: "UTC",
} satisfies NightCalculationInput;

describe("calculateNightSegments", () => {
  it("divides an exact six-hour night", () => {
    const result = calculateNightSegments(base);
    expect(result.segments).toHaveLength(6);
    expect(result.segments.every((segment) => segment.durationMilliseconds === 3_600_000)).toBe(
      true,
    );
    expect(result.midpoint).toBe("2026-01-01T21:00:00.000Z");
  });

  it("divides a nine-hour night", () => {
    const result = calculateNightSegments({ ...base, fajr: "2026-01-02T03:00:00Z" });
    expect(result.segments[0]!.durationMilliseconds).toBe(5_400_000);
  });

  it("preserves a millisecond remainder without gaps", () => {
    const result = calculateNightSegments({
      ...base,
      fajr: "2026-01-02T00:00:00.005Z",
    });
    expect(result.boundaries[6]!.instant).toBe("2026-01-02T00:00:00.005Z");
    expect(result.segments.reduce((sum, segment) => sum + segment.durationMilliseconds, 0)).toBe(
      result.night.durationMilliseconds,
    );
    result.segments.slice(1).forEach((segment, index) => {
      expect(segment.start).toBe(result.segments[index]!.end);
    });
  });

  it("maps religious scheduling layers without conflating them", () => {
    const result = calculateNightSegments(base);
    expect(result.dawudPattern.initialSleep.segments).toEqual([1, 2, 3]);
    expect(result.dawudPattern.prayer.segments).toEqual([4, 5]);
    expect(result.dawudPattern.finalSleep.segments).toEqual([6]);
    expect(result.lastThird.segments).toEqual([5, 6]);
    expect(result.segments[3]!.isWithinLastThird).toBe(false);
    expect(result.segments[4]!.isWithinLastThird).toBe(true);
  });

  it("uses absolute instants across an offset change", () => {
    const result = calculateNightSegments({
      maghrib: "2026-10-24T23:00:00+01:00",
      fajr: "2026-10-25T05:00:00+00:00",
      timeZone: "Europe/London",
    });
    expect(result.night.durationSeconds).toBe(7 * 3600);
  });

  it.each([
    ["leap year", "2028-02-29T18:00:00Z", "2028-03-01T06:00:00Z", "UTC"],
    ["half-hour", "2026-04-01T18:00:00+10:30", "2026-04-02T06:00:00+10:30", "Australia/Adelaide"],
    ["quarter-hour", "2026-04-01T18:00:00+05:45", "2026-04-02T05:00:00+05:45", "Asia/Kathmandu"],
    ["short", "2026-06-01T23:00:00Z", "2026-06-02T00:00:00Z", "UTC"],
  ])("handles %s fixtures", (_label, maghrib, fajr, timeZone) => {
    expect(calculateNightSegments({ maghrib, fajr, timeZone }).segments).toHaveLength(6);
  });

  it("accepts an explicitly confirmed very long night", () => {
    const result = calculateNightSegments({
      ...base,
      fajr: "2026-01-02T14:00:00Z",
      allowLongNight: true,
    });
    expect(result.night.durationSeconds).toBe(20 * 3600);
  });
});

describe("validation and presentation", () => {
  it("returns stable errors for missing, invalid, reversed, and zero inputs", () => {
    expect(validateNightInput({}).map((error) => error.code)).toEqual([
      "REQUIRED_FIELD",
      "REQUIRED_FIELD",
      "REQUIRED_FIELD",
    ]);
    expect(validateNightInput({ ...base, fajr: "not-a-date" })[0]!.code).toBe("INVALID_TIMESTAMP");
    expect(validateNightInput({ ...base, fajr: base.maghrib })[0]!.code).toBe(
      "INVALID_NIGHT_INTERVAL",
    );
    expect(validateNightInput({ ...base, fajr: "2025-12-31T23:00:00Z" })[0]!.code).toBe(
      "INVALID_NIGHT_INTERVAL",
    );
  });

  it("rejects invalid zones and wake buffers", () => {
    expect(validateNightInput({ ...base, timeZone: "Mars/Olympus" })[0]!.code).toBe(
      "INVALID_TIMEZONE",
    );
    expect(validateNightInput({ ...base, fajrWakeBufferMinutes: -1 })[0]!.code).toBe(
      "INVALID_WAKE_BUFFER",
    );
    expect(validateNightInput({ ...base, fajrWakeBufferMinutes: 999 })[0]!.code).toBe(
      "WAKE_BUFFER_EXCEEDS_NIGHT",
    );
  });

  it("formats locale-aware 12h and 24h times", () => {
    expect(formatInstant(base.maghrib, { locale: "en-GB", displayFormat: "24h" })).toContain(
      "18:00",
    );
    expect(formatInstant(base.maghrib, { locale: "en-US", displayFormat: "12h" })).toMatch(
      /6:00.*PM/,
    );
  });

  it("creates selected alarm items", () => {
    const plan = createAlarmPlan(calculateNightSegments(base), {
      atPart4: true,
      atPart5: true,
      atLastThird: true,
      minutesBeforeFajr: 15,
      endPrayerAtPart6: true,
      fajrPreparationMinutes: 20,
    });
    expect(plan.alarms).toHaveLength(6);
  });
});

describe("mathematical properties", () => {
  it("maintains all interval invariants", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 18 * 60 * 60 * 1000 }),
        fc.integer({ min: 0, max: 999 }),
        (duration, startRemainder) => {
          const start = Date.UTC(2030, 0, 1) + startRemainder;
          const result = calculateNightSegments({
            maghrib: new Date(start).toISOString(),
            fajr: new Date(start + duration).toISOString(),
            timeZone: "UTC",
          });
          expect(result.boundaries[0]!.epochMilliseconds).toBe(start);
          expect(result.boundaries[6]!.epochMilliseconds).toBe(start + duration);
          expect(result.segments.reduce((sum, item) => sum + item.durationMilliseconds, 0)).toBe(
            duration,
          );
          for (let index = 1; index < result.boundaries.length; index++)
            expect(result.boundaries[index]!.epochMilliseconds).toBeGreaterThanOrEqual(
              result.boundaries[index - 1]!.epochMilliseconds,
            );
          for (let index = 1; index < result.segments.length; index++)
            expect(result.segments[index]!.start).toBe(result.segments[index - 1]!.end);
          expect(result.midpoint).toBe(result.segments[3]!.start);
          expect(result.lastThird.start).toBe(result.segments[4]!.start);
        },
      ),
      { numRuns: 250 },
    );
  });
});
