import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "./buildCalendarEvents";
import { CALENDAR_APPLICATION, isServiceDate } from "./ownership";

/** iCalendar has whole-second precision; truncate subsecond engine boundaries only on export. */
export function calendarInstant(value: string): string {
  return Temporal.Instant.from(value)
    .toString({ smallestUnit: "second", roundingMode: "floor" })
    .replace(/[-:]/g, "");
}

function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function foldLine(value: string): string {
  const encoder = new TextEncoder();
  let output = "";
  let bytes = 0;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) {
      output += "\r\n ";
      bytes = 1;
    }
    output += character;
    bytes += size;
  }
  return output;
}

/** UTC instants avoid ambiguous wall times and do not require a VTIMEZONE component. */
export function generateICS(events: readonly CalendarEvent[], generatedAt: string): string {
  if (
    events.some(
      (event) =>
        !event.appEventId ||
        !/^[0-9a-f-]{36}$/.test(event.appEventId) ||
        !isServiceDate(event.serviceDate),
    )
  )
    throw new Error("Persist calendar export identities before serialization");
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Prophetic Night Segments//Calendar//EN",
      "CALSCALE:GREGORIAN",
      ...events.flatMap((event) => [
        "BEGIN:VEVENT",
        `UID:${event.appEventId}@${CALENDAR_APPLICATION}`,
        `X-SIXTH-APPLICATION:${CALENDAR_APPLICATION}`,
        "X-SIXTH-OWNERSHIP-VERSION:1",
        `X-SIXTH-APP-EVENT-ID:${event.appEventId}`,
        `X-SIXTH-SERVICE-DATE:${event.serviceDate}`,
        `DTSTAMP:${calendarInstant(generatedAt)}`,
        `DTSTART:${calendarInstant(event.start)}`,
        ...(Temporal.Instant.compare(event.end, event.start) > 0
          ? [`DTEND:${calendarInstant(event.end)}`]
          : []),
        `SUMMARY:${escapeText(event.title)}`,
        `DESCRIPTION:${escapeText(event.description)}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      ]),
      "END:VCALENDAR",
    ]
      .map(foldLine)
      .join("\r\n") + "\r\n"
  );
}
