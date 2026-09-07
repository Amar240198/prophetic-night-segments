import type { CalendarEvent } from "./buildCalendarEvents";
import { calendarInstant } from "./generateICS";

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${calendarInstant(event.start)}/${calendarInstant(event.end)}`,
    details: event.description,
    ctz: event.timeZone,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
