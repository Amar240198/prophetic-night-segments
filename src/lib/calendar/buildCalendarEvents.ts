import { Temporal } from "@js-temporal/polyfill";
import type { NightCalculationResult } from "@prophetic-night/night-engine";
import { maghribServiceDate } from "./ownership";

export const NIGHT_PART_TITLES = {
  "night-part-1": "Night — Part 1",
  "night-part-2": "Night — Part 2",
  "night-part-3": "Night — Part 3",
  "night-part-4": "Night — Part 4",
  "night-part-5": "Night — Part 5",
  "night-part-6": "Night — Part 6",
} as const;
export type NightPartEventId = keyof typeof NIGHT_PART_TITLES;
export type CalendarEventId =
  | NightPartEventId
  | "wake"
  | "last-third"
  | "final-sixth"
  | "prayer"
  | "fajr"
  | "sleep"
  | "prayer-fajr"
  | "prayer-dhuhr"
  | "prayer-asr"
  | "prayer-maghrib"
  | "prayer-isha"
  | "fasting-monday"
  | "fasting-thursday"
  | "fasting-white-day"
  | "fasting-dawud";

export interface CalendarEvent {
  id: string;
  /** Night events use the immutable Maghrib-associated date. Daily prayers use their civil date. */
  serviceDate?: string;
  /** Explicit identity scope keeps daily prayer dates separate from night service dates. */
  identityScope?: "night" | "daily-prayer" | "routine";
  /** Export identity, assigned once by the persistent export registry. */
  appEventId?: string;
  notificationMinutes?: number | null;
  title: string;
  start: string;
  end: string;
  description: string;
  timeZone: string;
}

export interface DailyPrayerSchedule {
  date: string;
  timeZone: string;
  source: string;
  fajr: string;
  sunrise: string;
  dhuhr: string;
  asr: string;
  maghrib: string;
  isha: string;
}

export function buildFastingCalendarEvent(
  date: string,
  kind: string,
  timeZone: string,
): CalendarEvent {
  const start = Temporal.PlainDateTime.from(`${date}T00:00:00`)
    .toZonedDateTime(timeZone)
    .toInstant()
    .toString();
  const end = Temporal.PlainDateTime.from(`${date}T23:59:00`)
    .toZonedDateTime(timeZone)
    .toInstant()
    .toString();
  const title =
    kind === "fasting-monday"
      ? "Fasting — Monday"
      : kind === "fasting-thursday"
        ? "Fasting — Thursday"
        : kind === "fasting-dawud"
          ? "Fasting — Dāwūd schedule"
          : "Fasting — White Day";
  return {
    id: kind,
    serviceDate: date,
    identityScope: "daily-prayer",
    title,
    start,
    end,
    description: `Optional fasting schedule for ${date}.`,
    timeZone,
  };
}

const DAILY_PRAYER_TITLES = {
  "prayer-fajr": "Fajr",
  "prayer-dhuhr": "Dhuhr",
  "prayer-asr": "Asr",
  "prayer-maghrib": "Maghrib",
  "prayer-isha": "Isha",
} as const;

/** Build civil-date prayer events from the same provider timetable used by the night engine. */
export function buildDailyPrayerEvents(schedule: DailyPrayerSchedule): CalendarEvent[] {
  const date = Temporal.PlainDate.from(schedule.date);
  const at = (clock: string) =>
    Temporal.PlainDateTime.from(`${date.toString()}T${clock.length === 5 ? `${clock}:00` : clock}`)
      .toZonedDateTime(schedule.timeZone, { disambiguation: "reject" })
      .toInstant()
      .toString();
  const description = [
    "Daily prayer timetable provided by the configured prayer source.",
    `Civil prayer date: ${schedule.date}`,
    `Prayer source: ${schedule.source}`,
    `Timezone: ${schedule.timeZone}`,
    "Sunrise is informational and is not an obligatory prayer event.",
  ].join("\n");
  return (Object.keys(DAILY_PRAYER_TITLES) as Array<keyof typeof DAILY_PRAYER_TITLES>).map((id) => {
    const field = id.replace("prayer-", "") as "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
    const instant = at(schedule[field]);
    return {
      id,
      serviceDate: schedule.date,
      identityScope: "daily-prayer" as const,
      title: DAILY_PRAYER_TITLES[id],
      start: instant,
      end: instant,
      description,
      timeZone: schedule.timeZone,
    };
  });
}
export interface CalendarOptions {
  wakeBufferMinutes: number;
  pattern: "last-third" | "dawud";
  prayerSource: string;
}

export class CalendarError extends Error {
  constructor(
    public readonly code: "INVALID_CALENDAR_BUFFER",
    message: string,
  ) {
    super(message);
    this.name = "CalendarError";
  }
}

export function formatCalendarTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "shortOffset",
  }).format(new Date(instant));
}

/** Consumes engine boundaries; only the optional wake offset is calculated here. */
export function buildCalendarEvents(
  result: NightCalculationResult,
  options: CalendarOptions,
): CalendarEvent[] {
  if (
    !Number.isInteger(options.wakeBufferMinutes) ||
    options.wakeBufferMinutes < 0 ||
    options.wakeBufferMinutes > 1440
  ) {
    throw new CalendarError(
      "INVALID_CALENDAR_BUFFER",
      "Enter a whole number of minutes from 0 to 1440.",
    );
  }
  const timeZone = result.input.timeZone;
  const window = options.pattern === "dawud" ? result.dawudPattern.prayer : result.lastThird;
  const wake = Temporal.Instant.from(window.start)
    .subtract({ minutes: options.wakeBufferMinutes })
    .toString();
  const display = (value: string) => formatCalendarTime(value, timeZone);
  const description = [
    "Calculated by Prophetic Night Segments (Sixth of the Night).",
    `Night: Maghrib → Fajr, ${display(result.night.start)} – ${display(result.night.end)}`,
    `Last Third: ${display(result.lastThird.start)} – ${display(result.lastThird.end)}`,
    `Suggested wake time: ${display(wake)}`,
    `Prayer window: ${options.pattern === "dawud" ? "Dāwūd pattern, Parts 4–5" : "Last third, Parts 5–6"}`,
    `Prayer source: ${options.prayerSource}`,
    `Timezone: ${timeZone}`,
    "Optional personal scheduling suggestion. Calendar notifications depend on your calendar settings.",
  ].join("\n");
  const event = (
    id: CalendarEventId,
    title: string,
    start: string,
    end?: string,
  ): CalendarEvent => ({
    id,
    serviceDate: maghribServiceDate(result.night.start, timeZone),
    title,
    start,
    end: end ?? start,
    description,
    timeZone,
  });
  return [
    event("wake", "Qiyam / Tahajjud — Wake Up", wake),
    event("last-third", "Qiyam / Tahajjud — Last Third Begins", result.lastThird.start),
    ...Object.entries(NIGHT_PART_TITLES).map(([id, title], index) =>
      event(
        id as NightPartEventId,
        title,
        result.boundaries[index]!.instant,
        result.boundaries[index + 1]!.instant,
      ),
    ),
    event("final-sixth", "Sixth of the Night — Final Sixth", result.dawudPattern.finalSleep.start),
    event("prayer", "Qiyam / Tahajjud — Prayer Window", window.start, window.end),
    event("fajr", "Fajr", result.night.end),
    ...(options.pattern === "dawud"
      ? [
          event(
            "sleep",
            "Qiyam / Tahajjud — Go Back to Sleep",
            result.dawudPattern.finalSleep.start,
          ),
        ]
      : []),
  ];
}
