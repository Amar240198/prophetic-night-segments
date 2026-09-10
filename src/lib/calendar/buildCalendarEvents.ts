import { Temporal } from "@js-temporal/polyfill";
import type { NightCalculationResult } from "@prophetic-night/night-engine";

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
  NightPartEventId | "wake" | "last-third" | "final-sixth" | "prayer" | "fajr" | "sleep";
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  description: string;
  timeZone: string;
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
