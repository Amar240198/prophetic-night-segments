import { requireFeature } from "@/lib/product/entitlements.server";
import { resolveDailyPrayerInstants } from "@/lib/calendar/buildCalendarEvents";
import { cachedPrayerNight } from "./prayer-cache.server";
import { NextRequest } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { readAppUserFromRequest } from "@/lib/auth/session.server";
import { database } from "@/lib/google-calendar/database.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { readSession } from "@/lib/google-calendar/session.server";
import { validateSyncRequest } from "@/lib/google-calendar/sync-plan.server";
import { buildDailyTimeline, validateAnalysis } from "./analysis";
import { GoogleCalendarReadProvider } from "./google-read.server";
import type { CalendarEvent, DailyTimeline } from "./model";
export async function calendarContext(request: NextRequest) {
  const user = await readAppUserFromRequest(request);
  if (!user) throw new GoogleCalendarError("UNAUTHENTICATED", 401);
  await requireFeature(user.id, "calendar-read");
  const session = await readSession(request, user.id);
  return { user, session, provider: new GoogleCalendarReadProvider(session, user.id) };
}
export async function selections(connectionId: string) {
  const rows =
    await database()`SELECT calendar_id FROM calendar_preferences WHERE connection_id=${connectionId} AND provider='google' AND read_enabled=true ORDER BY calendar_id`;
  return rows.map((r) => r.calendar_id as string);
}
export async function analysisPreferences(userId: string) {
  const rows =
    await database()`SELECT prayer_analysis FROM miqaat_preferences WHERE user_id=${userId}`;
  return validateAnalysis(rows[0]?.prayer_analysis ?? {});
}
export function timelineInput(value: unknown) {
  if (!value || typeof value !== "object") throw new GoogleCalendarError("INVALID_REQUEST");
  const v = value as Record<string, unknown>;
  return validateSyncRequest({
    source: v.source,
    startDate: v.date,
    nights: 1,
    selected: ["prayer-fajr"],
    options: {
      wakeBufferMinutes: 0,
      dawudSelected: false,
      fajrPreparationMinutes: 0,
      firstAdhanMinutes: null,
    },
  });
}
export async function timeline(
  context: Awaited<ReturnType<typeof calendarContext>>,
  value: unknown,
  ignoreEventId?: string,
): Promise<DailyTimeline> {
  const input = timelineInput(value);
  const times = await cachedPrayerNight(input.source, input.startDate);
  if (!times.dailyPrayerSchedule) throw new GoogleCalendarError("PRAYER_TIMES_UNAVAILABLE", 502);
  const prayers = resolveDailyPrayerInstants(times.dailyPrayerSchedule);
  const localDate = (instant: string) =>
    Temporal.Instant.from(instant).toZonedDateTimeISO(times.timeZone).toPlainDate().toString();
  if (
    localDate(prayers.fajr) !== input.startDate ||
    localDate(times.maghrib) !== input.startDate ||
    localDate(times.fajr) !== Temporal.PlainDate.from(input.startDate).add({ days: 1 }).toString()
  )
    throw new GoogleCalendarError("PRAYER_TIMES_UNAVAILABLE", 502);
  const preferences = await analysisPreferences(context.user.id);
  const selected = await selections(context.session.connectionId);
  let events: CalendarEvent[] = [];
  let calendarStatus: DailyTimeline["calendarStatus"] = selected.length
    ? "complete"
    : "not-selected";
  if (selected.length)
    try {
      const calendars = await context.provider.listCalendars();
      const chosen = calendars.filter((c) => selected.includes(c.id));
      if (chosen.length !== selected.length) throw new Error("CALENDAR_REMOVED");
      const start = Temporal.PlainDate.from(input.startDate)
        .toZonedDateTime({ timeZone: times.timeZone, plainTime: "00:00" })
        .toInstant()
        .toString();
      events = (
        await Promise.all(
          chosen.map((c) => context.provider.listEvents(c, { start, end: times.fajr })),
        )
      ).flat();
    } catch {
      calendarStatus = "unavailable";
    }
  const result = buildDailyTimeline({
    prayers,
    nextFajr: times.fajr,
    events: events.filter((e) => e.externalId !== ignoreEventId),
    preferences,
    calendarStatus,
    recommendations: process.env.MIQAT_RECOMMENDATIONS_ENABLED !== "false",
  });
  if (process.env.MIQAT_CONFLICT_ENGINE_ENABLED === "false")
    result.analyses = result.analyses.map((a) => ({
      ...a,
      status: "UNKNOWN",
      availableWindows: [],
      recommendedWindows: [],
      explanation: "Calendar conflict analysis is disabled.",
    }));
  return result;
}
