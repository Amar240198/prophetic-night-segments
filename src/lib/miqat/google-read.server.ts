import { blockProof, blockIdentity } from "./block-identity.server";
import { Temporal } from "@js-temporal/polyfill";
import type { BusyWindow, Calendar, CalendarEvent, CalendarReadProvider } from "./model";
import type { GoogleSession } from "@/lib/google-calendar/session.server";
import { googleFailure } from "@/lib/google-calendar/events.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
interface GoogleEvent {
  id: string;
  summary?: string;
  status?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string };
  transparency?: string;
  recurringEventId?: string;
  extendedProperties?: { private?: Record<string, string> };
}
export function normalizeGoogleEvent(e: GoogleEvent, c: Calendar): CalendarEvent | null {
  if (e.status === "cancelled") return null;
  const instant = (v: { dateTime?: string; date?: string } | undefined) =>
    v?.dateTime
      ? Temporal.Instant.from(v.dateTime).toString()
      : Temporal.PlainDate.from(v?.date ?? "")
          .toZonedDateTime({ timeZone: c.timezone, plainTime: "00:00" })
          .toInstant()
          .toString();
  const start = instant(e.start),
    end = instant(e.end);
  if (!e.id || Temporal.Instant.compare(start, end) >= 0)
    throw new GoogleCalendarError("CALENDAR_READ_INCOMPLETE", 502);
  return {
    id: `google:${c.id}:${e.id}`,
    externalId: e.id,
    provider: "google",
    calendarId: c.id,
    title: e.summary ?? "Busy",
    start,
    end,
    timezone: e.start?.timeZone ?? c.timezone,
    allDay: !!e.start?.date,
    status: e.status === "tentative" ? "tentative" : "confirmed",
    transparency: e.transparency === "transparent" ? "transparent" : "opaque",
    isWritable: c.isWritable,
    recurrence: e.recurringEventId,
    metadata: {},
  };
}
export class GoogleCalendarReadProvider implements CalendarReadProvider {
  readonly provider = "google" as const;
  constructor(
    private readonly session: GoogleSession,
    private readonly userId?: string,
  ) {}
  private async pages<T>(path: string, params: Record<string, string>): Promise<T[]> {
    const items: T[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 20; page++) {
      const url = new URL(`https://www.googleapis.com/calendar/v3/${path}`);
      url.search = new URLSearchParams({
        ...params,
        ...(pageToken ? { pageToken } : {}),
      }).toString();
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.session.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw await googleFailure(response);
      const data = await response.json();
      if (data.items !== undefined && !Array.isArray(data.items))
        throw new GoogleCalendarError("CALENDAR_READ_INCOMPLETE", 502);
      items.push(...(data.items ?? []));
      pageToken = data.nextPageToken;
      if (!pageToken) return items;
    }
    throw new GoogleCalendarError("CALENDAR_READ_INCOMPLETE", 502);
  }
  private calendars?: Promise<Calendar[]>;
  listCalendars(): Promise<Calendar[]> {
    return (this.calendars ??= this.loadCalendars());
  }
  private async loadCalendars(): Promise<Calendar[]> {
    const rows = await this.pages<{
      id: string;
      summary?: string;
      timeZone?: string;
      accessRole: string;
      primary?: boolean;
    }>("users/me/calendarList", {
      maxResults: "250",
      fields: "items(id,summary,timeZone,accessRole,primary),nextPageToken",
    });
    return rows
      .filter((c) => ["reader", "writer", "owner"].includes(c.accessRole))
      .map((c) => ({
        id: c.id,
        provider: "google",
        title: c.summary ?? c.id,
        timezone: c.timeZone ?? "UTC",
        isWritable: ["writer", "owner"].includes(c.accessRole),
        isPrimary: c.primary === true,
      }));
  }
  async listEvents(calendar: Calendar, range: BusyWindow): Promise<CalendarEvent[]> {
    const duration =
      Temporal.Instant.from(range.end).epochMilliseconds -
      Temporal.Instant.from(range.start).epochMilliseconds;
    if (duration <= 0 || duration > 32 * 86400000) throw new GoogleCalendarError("INVALID_REQUEST");
    const rows = await this.pages<GoogleEvent>(
      `calendars/${encodeURIComponent(calendar.id)}/events`,
      {
        timeMin: range.start,
        timeMax: range.end,
        singleEvents: "true",
        showDeleted: "false",
        maxResults: "250",
        fields:
          "items(id,summary,status,start,end,transparency,recurringEventId,extendedProperties),nextPageToken",
      },
    );
    return rows
      .map((e) => {
        const normalized = normalizeGoogleEvent(e, calendar);
        const p = e.extendedProperties?.private;
        if (
          normalized &&
          this.userId &&
          p?.type === "prayer_block" &&
          p.prayer &&
          p.date &&
          e.id ===
            blockIdentity(this.userId, this.session.connectionId, p.date, p.prayer, calendar.id) &&
          p.miqatProof === blockProof(e.id)
        )
          normalized.metadata = {
            createdBy: "miqat",
            type: "prayer_block",
            prayer: p.prayer,
            date: p.date,
          };
        return normalized;
      })
      .filter((e): e is CalendarEvent => e !== null);
  }
  async getFreeBusy(calendars: Calendar[], range: BusyWindow): Promise<BusyWindow[]> {
    return (await Promise.all(calendars.map((c) => this.listEvents(c, range))))
      .flat()
      .filter((e) => e.transparency === "opaque")
      .map((e) => ({ start: e.start, end: e.end }));
  }
}
