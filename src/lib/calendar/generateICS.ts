import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "./buildCalendarEvents";

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
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Prophetic Night Segments//Calendar//EN",
      "CALSCALE:GREGORIAN",
      ...events.flatMap((event) => [
        "BEGIN:VEVENT",
        `UID:${escapeText(`${event.id}-${Temporal.Instant.from(event.start).epochMilliseconds}@prophetic-night-segments`)}`,
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
