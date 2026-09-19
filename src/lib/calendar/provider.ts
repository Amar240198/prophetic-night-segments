import type { CalendarEvent } from "./buildCalendarEvents";
import type { CalendarProvider, ExternalCalendarMapping } from "./ownership";

export interface CalendarDescriptor {
  id: string;
  name: string;
  provider: CalendarProvider;
  readOnly?: boolean;
}

export interface ProviderEvent {
  providerEventId: string;
  etag?: string;
  event: CalendarEvent;
}

/** Provider-neutral contract for managed calendar reconciliation. */
export interface CalendarProviderAdapter {
  readonly provider: CalendarProvider;
  listCalendars(): Promise<CalendarDescriptor[]>;
  createEvent(
    calendarId: string,
    event: CalendarEvent,
    identity: ExternalCalendarMapping,
  ): Promise<ProviderEvent>;
  updateEvent(
    calendarId: string,
    providerEventId: string,
    event: CalendarEvent,
    identity: ExternalCalendarMapping,
  ): Promise<ProviderEvent>;
  deleteEvent(
    calendarId: string,
    providerEventId: string,
    identity: ExternalCalendarMapping,
  ): Promise<void>;
  verifyOwnership(event: unknown, identity: ExternalCalendarMapping): boolean;
}

/** Apple Calendar is intentionally export-only: ICS has no remote ownership API. */
export interface IcsCalendarProvider {
  readonly provider: "apple" | "ics";
  export(events: readonly CalendarEvent[], generatedAt: string): Promise<string>;
}

/** Calendar clients that can subscribe to or open a standards-compliant ICS file. */
export type CalendarExportTarget = "apple" | "fantastical" | "notion" | "ics";

export interface CalendarExportProvider {
  readonly target: CalendarExportTarget;
  export(events: readonly CalendarEvent[], generatedAt: string): Promise<string>;
}
