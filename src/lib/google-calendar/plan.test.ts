import { calculateNightSegments } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";
import { buildGooglePlan } from "./plan";
import { googleEventPayload, validateSelectedEvents } from "./events.server";

const options = {
  wakeBufferMinutes: 15,
  dawudSelected: true,
  prayerSource: "Manual",
  fajrPreparationMinutes: 20,
  firstAdhanMinutes: null,
};
describe("Google plan payloads", () => {
  it.each([
    ["2026-03-28T18:00:00Z", "2026-03-29T05:00:00Z", "Europe/London"],
    ["2026-10-24T18:00:00+01:00", "2026-10-25T05:00:00Z", "Europe/London"],
    ["2026-12-31T18:00:00+05:30", "2027-01-01T06:00:00+05:30", "Asia/Kolkata"],
    ["2026-12-31T18:00:00+05:45", "2027-01-01T06:00:00+05:45", "Asia/Kathmandu"],
  ])("preserves the engine timestamps and explicit timezone: %s", (maghrib, fajr, timeZone) => {
    const result = calculateNightSegments({ maghrib, fajr, timeZone });
    const original = structuredClone(result);
    const plan = buildGooglePlan(result, options);
    const prayer = plan.find((event) => event.id === "dawud-prayer")!;
    const payload = googleEventPayload(prayer);
    expect(payload.start).toEqual({ dateTime: result.dawudPattern.prayer.start, timeZone });
    expect(payload.end).toEqual({ dateTime: result.dawudPattern.prayer.end, timeZone });
    expect(Date.parse(plan[0]!.start)).toBe(
      Date.parse(result.dawudPattern.prayer.start) - 15 * 60_000,
    );
    expect(plan.find((event) => event.id === "part-5")!.start).toBe(result.lastThird.start);
    expect(result).toEqual(original);
  });
  it("uses existing optional offsets and excludes disabled First Adhan", () => {
    const result = calculateNightSegments({
      maghrib: "2026-12-31T18:00:00Z",
      fajr: "2027-01-01T06:00:00Z",
      timeZone: "UTC",
    });
    expect(
      buildGooglePlan(result, options).some((event) => event.id === "first-adhan-reminder"),
    ).toBe(false);
    const plan = buildGooglePlan(result, { ...options, firstAdhanMinutes: 30 });
    expect(plan.find((event) => event.id === "first-adhan-reminder")?.start).toBe(
      "2027-01-01T05:30:00.000Z",
    );
    expect(plan.find((event) => event.id === "fajr-preparation")?.start).toBe(
      "2027-01-01T05:40:00.000Z",
    );
    expect(plan.find((event) => event.id === "dawud-prayer")?.description).toContain(
      "Ṣaḥīḥ al-Bukhārī 1131",
    );
    expect(plan[0]?.start).toBe("2026-12-31T23:45:00Z");
  });
  it("normalizes equivalent offsets to the same retry identifier and escapes HTML", () => {
    const base = {
      id: "fajr",
      title: "Fajr",
      start: "2027-01-01T06:00:00Z",
      end: "2027-01-01T06:00:00Z",
      timeZone: "UTC",
      description: "<script>bad</script> & context",
    };
    const equivalent = {
      ...base,
      start: "2027-01-01T07:00:00+01:00",
      end: "2027-01-01T07:00:00+01:00",
    };
    expect(googleEventPayload(base).id).toBe(googleEventPayload(equivalent).id);
    expect(googleEventPayload(base).description).toBe(
      "&lt;script&gt;bad&lt;/script&gt; &amp; context",
    );
    expect(googleEventPayload(base).id).toMatch(/^[0-9a-v]{64}$/);
    expect(validateSelectedEvents({ events: [base] })).toHaveLength(1);
  });
});
