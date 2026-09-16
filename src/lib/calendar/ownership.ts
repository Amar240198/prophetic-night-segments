import { Temporal } from "@js-temporal/polyfill";

/** A technical namespace, deliberately independent of the public product name. */
export const CALENDAR_APPLICATION = "prophetic-night-segments";
export const OWNERSHIP_VERSION = 1;
export type CalendarProvider = "google" | "microsoft" | "apple" | "ics";

export interface AppCalendarEventIdentity {
  readonly appEventId: string;
  readonly ownerApplication: typeof CALENDAR_APPLICATION;
  readonly ownershipVersion: typeof OWNERSHIP_VERSION;
  readonly connectionId: string;
  readonly serviceDate: string;
  readonly eventKind: string;
  readonly serviceTimeZone: string | null;
}

export interface ExternalCalendarMapping extends AppCalendarEventIdentity {
  readonly provider: CalendarProvider;
  readonly accountSubject: string;
  readonly calendarId: string;
  readonly providerEventId: string;
  readonly metadataVersion: number;
  readonly deletedAt: string | null;
}

/** Capabilities must be implemented and verified by each real provider adapter. */
export interface CalendarOwnershipAdapter<TEvent> {
  readonly provider: CalendarProvider;
  verifyOwnership(event: TEvent, mapping: ExternalCalendarMapping): boolean;
}

export function isServiceDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  try {
    const date = Temporal.PlainDate.from(value);
    return date.year >= 2000 && date.year <= 2100;
  } catch {
    return false;
  }
}

/** Called only at creation from supplied Maghrib, never from an event's start. */
export function maghribServiceDate(maghrib: string, timeZone: string): string {
  return Temporal.Instant.from(maghrib).toZonedDateTimeISO(timeZone).toPlainDate().toString();
}
