import type { NightCalculationResult } from "@prophetic-night/night-engine";
import type { DailyPrayerSchedule } from "@/lib/calendar/buildCalendarEvents";
export type Provider = "google" | "microsoft" | "apple" | "ics";
export interface CalendarAccount {
  id: string;
  provider: Provider;
  label: string;
}
export interface CalendarConnection {
  id: string;
  account: CalendarAccount;
  readEnabled: boolean;
  managementEnabled: boolean;
  status: "connected" | "reauthorization_required";
}
export interface Calendar {
  id: string;
  provider: Provider;
  title: string;
  timezone: string;
  isWritable: boolean;
  isPrimary: boolean;
}
export interface BusyWindow {
  start: string;
  end: string;
}
export interface CalendarEvent extends BusyWindow {
  id: string;
  provider: Provider;
  externalId: string;
  calendarId: string;
  title: string;
  description?: string;
  timezone: string;
  allDay: boolean;
  status: "confirmed" | "tentative" | "cancelled";
  location?: string;
  attendees?: string[];
  organizer?: string;
  recurrence?: string;
  transparency: "opaque" | "transparent";
  isWritable: boolean;
  metadata: Record<string, string>;
}
export interface CalendarReadProvider {
  readonly provider: Provider;
  listCalendars(): Promise<Calendar[]>;
  listEvents(calendar: Calendar, range: BusyWindow): Promise<CalendarEvent[]>;
  getFreeBusy(calendars: Calendar[], range: BusyWindow): Promise<BusyWindow[]>;
}
export type Prayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";
export interface PrayerPreference {
  minimumRequiredMinutes: number;
  bufferBefore: number;
  bufferAfter: number;
  protectionMode: "OFF" | "SUGGEST_ONLY" | "CREATE_CALENDAR_BLOCK";
}
export interface AnalysisPreferences extends PrayerPreference {
  ishaEnd: "midpoint" | "next-fajr";
}
export interface PrayerWindow extends BusyWindow, PrayerPreference {
  prayer: Prayer;
  preferredStart: string;
  preferredEnd: string;
  policy: string;
}
export interface Recommendation extends BusyWindow {
  reasons: string[];
}
export interface PrayerAnalysis {
  prayer: Prayer;
  prayerWindow: PrayerWindow;
  status: "CLEAR" | "TIGHT" | "PARTIAL_CONFLICT" | "FULL_CONFLICT" | "PROTECTED" | "UNKNOWN";
  conflictingEvents: CalendarEvent[];
  availableWindows: BusyWindow[];
  recommendedWindows: Recommendation[];
  explanation: string;
}
export interface DailyTimeline {
  date: string;
  timezone: string;
  prayers: DailyPrayerSchedule;
  night: NightCalculationResult;
  events: CalendarEvent[];
  preferences: AnalysisPreferences;
  analyses: PrayerAnalysis[];
  calendarStatus: "complete" | "unavailable" | "not-selected";
}
export interface CalendarMutation {
  operation: "create" | "update" | "delete";
  calendarId: string;
  entityId: string;
  idempotencyKey: string;
  before: BusyWindow | null;
  after: BusyWindow | null;
}

/** Provider authentication and writes stay outside the deterministic timeline engine. */
export interface CalendarProviderLifecycle {
  connect(mode: "read" | "manage"): Promise<{ authorizationUrl: string }>;
  disconnect(): Promise<void>;
  refreshCredentials(): Promise<void>;
}
export interface CalendarManagementProvider {
  createEvent(mutation: CalendarMutation): Promise<{ externalId: string }>;
  updateEvent(mutation: CalendarMutation): Promise<void>;
  deleteEvent(mutation: CalendarMutation): Promise<void>;
}
