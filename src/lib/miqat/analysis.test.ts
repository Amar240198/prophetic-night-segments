import { describe, it, expect } from "vitest";
import {
  analysePrayer,
  prayerWindows,
  DEFAULT_ANALYSIS,
  buildDailyTimeline,
  validateAnalysis,
} from "./analysis";
import { normalizeGoogleEvent } from "./google-read.server";
import type { Calendar, CalendarEvent, PrayerWindow } from "./model";
const c: Calendar = {
  id: "work",
  provider: "google",
  title: "Work",
  timezone: "Europe/London",
  isWritable: false,
  isPrimary: false,
};
const at = (s: string) => `2026-09-20T${s}:00Z`;
const w: PrayerWindow = {
  ...DEFAULT_ANALYSIS,
  prayer: "dhuhr",
  start: at("13:08"),
  end: at("16:41"),
  preferredStart: at("13:08"),
  preferredEnd: at("13:28"),
  policy: "fixture",
};
function event(start: string, end: string, extra: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: start,
    provider: "google",
    externalId: start,
    calendarId: "work",
    title: "Meeting",
    start: at(start),
    end: at(end),
    timezone: "UTC",
    allDay: false,
    status: "confirmed",
    transparency: "opaque",
    isWritable: false,
    metadata: {},
    ...extra,
  };
}
describe("deterministic calendar analysis", () => {
  it("finds multiple usable windows and ranks earliest with explicit buffers", () => {
    const a = analysePrayer(w, [event("12:30", "13:30"), event("14:00", "15:00")]);
    expect(a.status).toBe("PARTIAL_CONFLICT");
    expect(a.availableWindows).toEqual([
      { start: at("13:35"), end: at("13:55") },
      { start: at("15:05"), end: at("16:41") },
    ]);
    expect(a.recommendedWindows[0]).toMatchObject({ start: at("13:35"), end: at("13:55") });
    expect(a.recommendedWindows[0]!.reasons.join(" ")).toContain("20 uninterrupted");
  });
  it("merges overlapping and back-to-back meetings", () => {
    const a = analysePrayer(w, [
      event("13:00", "14:00"),
      event("13:30", "15:00"),
      event("15:00", "17:00"),
    ]);
    expect(a.status).toBe("FULL_CONFLICT");
    expect(a.availableWindows).toEqual([]);
  });
  it("is clear with no events, ignoring cancelled and transparent events", () => {
    expect(analysePrayer(w, []).status).toBe("CLEAR");
    expect(
      analysePrayer(w, [
        event("13:00", "17:00", { status: "cancelled" }),
        event("13:00", "17:00", { transparency: "transparent" }),
      ]).status,
    ).toBe("CLEAR");
  });
  it("never claims availability on incomplete coverage", () => {
    expect(analysePrayer(w, [], false)).toMatchObject({
      status: "UNKNOWN",
      availableWindows: [],
      recommendedWindows: [],
    });
  });
  it("flags tight windows with sufficient duration", () => {
    expect(analysePrayer({ ...w, end: at("13:33") }, []).status).toBe("TIGHT");
  });
  it("compares foreign offsets and midnight crossings by absolute instant", () => {
    expect(
      analysePrayer(w, [
        event("01:00", "02:00", {
          start: "2026-09-20T08:00:00-05:00",
          end: "2026-09-21T02:00:00+09:00",
        }),
      ]).status,
    ).toBe("FULL_CONFLICT");
  });
  it("keeps one-minute precision and excludes zero-length gaps", () => {
    expect(
      analysePrayer({ ...w, bufferBefore: 0, bufferAfter: 0 }, [
        event("13:08", "14:00"),
        event("14:00", "16:41"),
      ]).availableWindows,
    ).toEqual([]);
  });
  it("validates preferences rather than silently coercing values", () => {
    expect(() => validateAnalysis({ minimumRequiredMinutes: -1 })).toThrow();
    expect(() => validateAnalysis({ bufferBefore: "5" })).toThrow();
  });
});
describe("provider normalization", () => {
  it.each([
    ["2026-03-29", "2026-03-30", 23],
    ["2026-10-25", "2026-10-26", 25],
  ])("handles DST all-day %s without assuming 24 hours", (start, end, hours) => {
    const e = normalizeGoogleEvent({ id: "all", start: { date: start }, end: { date: end } }, c)!;
    expect((Date.parse(e.end) - Date.parse(e.start)) / 3600000).toBe(hours);
    expect(e.allDay).toBe(true);
  });
  it("preserves expanded recurrence instance identity", () => {
    const e = normalizeGoogleEvent(
      {
        id: "instance",
        recurringEventId: "series",
        start: { dateTime: at("13:00") },
        end: { dateTime: at("14:00") },
      },
      c,
    )!;
    expect(e.externalId).toBe("instance");
    expect(e.recurrence).toBe("series");
  });
  it("drops cancelled exceptions before requiring timestamps", () =>
    expect(normalizeGoogleEvent({ id: "cancelled", status: "cancelled" }, c)).toBeNull());
  it("rejects missing or reversed dates", () =>
    expect(() =>
      normalizeGoogleEvent(
        { id: "bad", start: { dateTime: at("15:00") }, end: { dateTime: at("14:00") } },
        c,
      ),
    ).toThrow());
});
const prayers = {
  date: "2026-09-20",
  timeZone: "Europe/London",
  source: "fixture",
  fajr: at("04:30"),
  sunrise: at("06:00"),
  dhuhr: at("12:30"),
  asr: at("15:30"),
  maghrib: at("18:00"),
  isha: at("19:30"),
};
it("uses supplied prayer and canonical night boundaries with configurable Isha policy", () => {
  const nextFajr = "2026-09-21T04:30:00Z";
  const windows = prayerWindows(prayers, nextFajr, DEFAULT_ANALYSIS);
  expect(windows[0]!.end).toBe(prayers.sunrise);
  expect(windows[1]!.end).toBe(prayers.asr);
  const day = buildDailyTimeline({
    prayers,
    nextFajr,
    events: [],
    preferences: DEFAULT_ANALYSIS,
    calendarStatus: "complete",
  });
  expect(windows[4]!.end).toBe(day.night.midpoint);
  expect(day.night.segments).toHaveLength(6);
  expect(
    prayerWindows(prayers, nextFajr, { ...DEFAULT_ANALYSIS, ishaEnd: "next-fajr" })[4]!.end,
  ).toBe(nextFajr);
});
