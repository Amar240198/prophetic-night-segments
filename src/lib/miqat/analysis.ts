import { Temporal } from "@js-temporal/polyfill";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import type { DailyPrayerSchedule } from "@/lib/calendar/buildCalendarEvents";
import type {
  AnalysisPreferences,
  BusyWindow,
  CalendarEvent,
  DailyTimeline,
  Prayer,
  PrayerAnalysis,
  PrayerWindow,
} from "./model";
export const DEFAULT_ANALYSIS: AnalysisPreferences = {
  minimumRequiredMinutes: 20,
  bufferBefore: 5,
  bufferAfter: 5,
  protectionMode: "SUGGEST_ONLY",
  ishaEnd: "midpoint",
};
export function validateAnalysis(value: unknown): AnalysisPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("INVALID_PREFERENCES");
  const p = { ...DEFAULT_ANALYSIS, ...value } as AnalysisPreferences;
  for (const [key, min, max] of [
    ["minimumRequiredMinutes", 1, 120],
    ["bufferBefore", 0, 60],
    ["bufferAfter", 0, 60],
  ] as const)
    if (!Number.isInteger(p[key]) || p[key] < min || p[key] > max)
      throw new Error("INVALID_PREFERENCES");
  if (
    !["OFF", "SUGGEST_ONLY", "CREATE_CALENDAR_BLOCK"].includes(p.protectionMode) ||
    !["midpoint", "next-fajr"].includes(p.ishaEnd)
  )
    throw new Error("INVALID_PREFERENCES");
  return {
    minimumRequiredMinutes: p.minimumRequiredMinutes,
    bufferBefore: p.bufferBefore,
    bufferAfter: p.bufferAfter,
    protectionMode: p.protectionMode,
    ishaEnd: p.ishaEnd,
  };
}
const ms = (v: string) => Temporal.Instant.from(v).epochMilliseconds;
const iso = (v: number) => Temporal.Instant.fromEpochMilliseconds(v).toString();
export function prayerWindows(
  prayers: DailyPrayerSchedule,
  nextFajr: string,
  p: AnalysisPreferences,
): PrayerWindow[] {
  const night = calculateNightSegments({
    maghrib: prayers.maghrib,
    fajr: nextFajr,
    timeZone: prayers.timeZone,
  });
  const ends = {
    fajr: prayers.sunrise,
    dhuhr: prayers.asr,
    asr: prayers.maghrib,
    maghrib: prayers.isha,
    isha: p.ishaEnd === "midpoint" ? night.midpoint : nextFajr,
  };
  return (Object.keys(ends) as Prayer[]).map((prayer) => {
    const start = prayers[prayer],
      end = ends[prayer];
    if (ms(end) <= ms(start)) throw new Error("INVALID_PRAYER_WINDOW");
    return {
      ...p,
      prayer,
      start,
      end,
      preferredStart: start,
      preferredEnd: iso(Math.min(ms(end), ms(start) + p.minimumRequiredMinutes * 60000)),
      policy:
        prayer === "isha"
          ? `User scheduling cutoff: ${p.ishaEnd}; not a jurisprudential ruling.`
          : "Supplied prayer timetable boundaries; confirm local religious guidance.",
    };
  });
}
export function analysePrayer(
  w: PrayerWindow,
  events: readonly CalendarEvent[],
  complete = true,
  recommendations = true,
): PrayerAnalysis {
  const start = ms(w.start),
    end = ms(w.end),
    duration = w.minimumRequiredMinutes * 60000;
  const protectedEvent = events.find(
    (e) =>
      e.metadata.createdBy === "miqat" &&
      e.metadata.type === "prayer_block" &&
      e.metadata.prayer === w.prayer &&
      e.status !== "cancelled" &&
      ms(e.start) >= start &&
      ms(e.end) <= end &&
      ms(e.end) - ms(e.start) >= duration,
  );
  const protectedClear =
    protectedEvent &&
    !events.some(
      (e) =>
        e.id !== protectedEvent.id &&
        e.status !== "cancelled" &&
        e.transparency !== "transparent" &&
        ms(e.start) - w.bufferBefore * 60000 < ms(protectedEvent.end) &&
        ms(e.end) + w.bufferAfter * 60000 > ms(protectedEvent.start),
    );
  const conflictingEvents = events.filter(
    (e) =>
      e.status !== "cancelled" &&
      e.transparency !== "transparent" &&
      ms(e.start) - w.bufferBefore * 60000 < end &&
      ms(e.end) + w.bufferAfter * 60000 > start,
  );
  const occupied = conflictingEvents
    .map((e) => [
      Math.max(start, ms(e.start) - w.bufferBefore * 60000),
      Math.min(end, ms(e.end) + w.bufferAfter * 60000),
    ])
    .sort((a, b) => a[0]! - b[0]!);
  const free: BusyWindow[] = [];
  let cursor = start;
  for (const [a, b] of occupied) {
    if (a! > cursor) free.push({ start: iso(cursor), end: iso(a!) });
    cursor = Math.max(cursor, b!);
  }
  if (cursor < end) free.push({ start: iso(cursor), end: iso(end) });
  const usable = free.filter((v) => ms(v.end) - ms(v.start) >= duration);
  const status = !complete
    ? "UNKNOWN"
    : protectedClear
      ? "PROTECTED"
      : !usable.length
        ? "FULL_CONFLICT"
        : usable.every((v) => ms(v.end) - ms(v.start) < duration + 10 * 60000)
          ? "TIGHT"
          : conflictingEvents.length
            ? "PARTIAL_CONFLICT"
            : "CLEAR";
  return {
    prayer: w.prayer,
    prayerWindow: w,
    status,
    conflictingEvents,
    availableWindows: complete ? free : [],
    recommendedWindows:
      complete && !protectedClear && recommendations && w.protectionMode !== "OFF"
        ? usable.slice(0, 3).map((v) => ({
            start: v.start,
            end: iso(ms(v.start) + duration),
            reasons: [
              `Inside supplied ${w.prayer} window ${w.start} – ${w.end}.`,
              `Earliest available slot with ${w.minimumRequiredMinutes} uninterrupted minutes.`,
              `${w.bufferBefore}-minute pre-meeting and ${w.bufferAfter}-minute post-meeting buffers applied.`,
              `No overlap with busy events in selected calendars.`,
              w.policy,
            ],
          }))
        : [],
    explanation: !complete
      ? "Calendar coverage is unavailable; availability cannot be established."
      : !usable.length
        ? "No uninterrupted slot meets the requested duration and buffers."
        : `${usable.length} usable window(s), ranked by earliest start.`,
  };
}
export function buildDailyTimeline(input: {
  prayers: DailyPrayerSchedule;
  nextFajr: string;
  events: CalendarEvent[];
  preferences: AnalysisPreferences;
  calendarStatus: DailyTimeline["calendarStatus"];
  recommendations?: boolean;
}): DailyTimeline {
  const { prayers, nextFajr, events, preferences, calendarStatus } = input;
  return {
    date: prayers.date,
    timezone: prayers.timeZone,
    prayers,
    night: calculateNightSegments({
      maghrib: prayers.maghrib,
      fajr: nextFajr,
      timeZone: prayers.timeZone,
    }),
    events,
    preferences,
    calendarStatus,
    analyses: prayerWindows(prayers, nextFajr, preferences).map((w) =>
      analysePrayer(w, events, calendarStatus === "complete", input.recommendations),
    ),
  };
}
