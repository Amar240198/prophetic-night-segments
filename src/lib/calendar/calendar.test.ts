import { calculateNightSegments } from "@prophetic-night/night-engine";
import { describe, expect, it } from "vitest";
import { buildCalendarEvents, formatCalendarTime } from "./buildCalendarEvents";
import { generateICS } from "./generateICS";
import { googleCalendarUrl } from "./googleCalendarUrl";

const options = {
  wakeBufferMinutes: 15,
  pattern: "last-third" as const,
  prayerSource: "Manual input",
};
const night = calculateNightSegments({
  maghrib: "2026-01-01T18:00:00Z",
  fajr: "2026-01-02T06:00:00Z",
  timeZone: "UTC",
});

describe("calendar layer", () => {
  it("uses engine boundaries without mutating the result", () => {
    const before = structuredClone(night);
    const events = buildCalendarEvents(night, options);
    expect(events.map(({ id, start }) => [id, Date.parse(start)])).toEqual([
      ["wake", Date.parse("2026-01-02T01:45:00Z")],
      ["last-third", Date.parse(night.lastThird.start)],
      ...night.boundaries
        .slice(0, 6)
        .map((boundary, index) => [`night-part-${index + 1}`, boundary.epochMilliseconds]),
      ["final-sixth", Date.parse(night.dawudPattern.finalSleep.start)],
      ["prayer", Date.parse(night.lastThird.start)],
      ["fajr", Date.parse(night.night.end)],
    ]);
    expect(events.find((event) => event.id === "prayer")?.end).toBe(night.lastThird.end);
    expect(night).toEqual(before);
    expect(events[0]?.description).toContain("Prayer source: Manual input");
  });
  it("uses Parts 4–5 for Dawud, including a wake event on the previous year", () => {
    const result = calculateNightSegments({
      maghrib: "2026-12-31T18:00:00Z",
      fajr: "2027-01-01T06:00:00Z",
      timeZone: "UTC",
    });
    const events = buildCalendarEvents(result, { ...options, pattern: "dawud" });
    expect(events[0]?.start).toBe("2026-12-31T23:45:00Z");
    expect(events.find((event) => event.id === "prayer")).toMatchObject({
      start: result.midpoint,
      end: result.dawudPattern.finalSleep.start,
    });
    expect(events.find((event) => event.id === "sleep")?.start).toBe(
      result.dawudPattern.finalSleep.start,
    );
  });
  it.each([
    [
      "2026-03-28T20:00:00Z",
      "2026-03-29T05:00:00Z",
      "Europe/London",
      "2026-03-29T00:45:00Z",
      "GMT+1",
    ],
    [
      "2026-10-24T20:00:00Z",
      "2026-10-25T05:00:00Z",
      "Europe/London",
      "2026-10-25T00:45:00Z",
      "GMT",
    ],
    [
      "2026-01-01T18:00:00+05:30",
      "2026-01-02T06:00:00+05:30",
      "Asia/Kolkata",
      "2026-01-01T20:15:00Z",
      "GMT+5:30",
    ],
  ])(
    "preserves instants across timezone transitions: %s",
    (maghrib, fajr, timeZone, wake, offset) => {
      const result = calculateNightSegments({ maghrib, fajr, timeZone });
      const events = buildCalendarEvents(result, {
        ...options,
        wakeBufferMinutes: timeZone === "Europe/London" ? 75 : 15,
      });
      expect(events[0]?.start).toBe(wake);
      expect(formatCalendarTime(result.lastThird.start, timeZone)).toContain(offset);
      expect(generateICS(events, maghrib)).toContain(`DTSTART:${wake.replace(/[-:]/g, "")}`);
    },
  );
  it.each([-1, 1.5, NaN, Infinity, 1441])("rejects invalid buffer %s", (wakeBufferMinutes) => {
    expect(() => buildCalendarEvents(night, { ...options, wakeBufferMinutes })).toThrow(
      expect.objectContaining({ code: "INVALID_CALENDAR_BUFFER" }),
    );
  });
  it("supports zero buffer and preserves millisecond boundaries until serialization", () => {
    const result = calculateNightSegments({
      maghrib: "2026-01-01T18:00:00Z",
      fajr: "2026-01-02T06:00:01Z",
      timeZone: "UTC",
    });
    const events = buildCalendarEvents(result, { ...options, wakeBufferMinutes: 0 });
    expect(Date.parse(events[0]!.start)).toBe(Date.parse(result.lastThird.start));
    expect(generateICS(events, result.night.start)).toContain("DTSTART:20260102T020000Z");
  });
  it("escapes text, folds UTF-8 lines, uses CRLF and serializes only supplied events", () => {
    const event = buildCalendarEvents(night, options)[0]!;
    event.description = "Provider, test; \\ source\r\nBEGIN:VEVENT\n" + "夜 ﷺ".repeat(80);
    const ics = generateICS([event], "2026-01-01T12:00:00Z");
    expect(ics).toContain("DTSTAMP:20260101T120000Z");
    expect(ics).toContain("SUMMARY:Qiyam / Tahajjud — Wake Up");
    expect(ics).not.toContain("DTEND:");
    expect(ics.match(/^BEGIN:VEVENT$/gm)).toHaveLength(1);
    expect(ics.replace(/\r\n /g, "")).toContain(
      "Provider\\, test\\; \\\\ source\\nBEGIN:VEVENT\\n",
    );
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const line of ics.split("\r\n"))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });
  it("encodes Google event details and exact UTC dates", () => {
    const event = buildCalendarEvents(night, options).find((event) => event.id === "prayer")!;
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin).toBe("https://calendar.google.com");
    expect(url.searchParams.get("dates")).toBe("20260102T020000Z/20260102T060000Z");
    expect(url.searchParams.get("details")).toBe(event.description);
    expect(url.searchParams.get("ctz")).toBe("UTC");
  });
});
