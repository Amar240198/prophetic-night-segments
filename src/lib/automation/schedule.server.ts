import { Temporal } from "@js-temporal/polyfill";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import {
  buildDailyPrayerEvents,
  buildFastingCalendarEvent,
  type CalendarEvent,
  type DailyPrayerSchedule,
} from "@/lib/calendar/buildCalendarEvents";
import { buildRoutineCalendarEvent } from "@/lib/routines/occurrences";
import { validateRoutine, type Routine } from "@/lib/routines/model";
import { fastingDates, islamicCivilDate } from "@/lib/fasting/schedule";
import {
  loadSyncNight,
  syncDates,
  validateSyncRequest,
} from "@/lib/google-calendar/sync-plan.server";
import { database } from "@/lib/google-calendar/database.server";
import type { SyncSource } from "@/lib/google-calendar/sync";
import { DEFAULT_AUTOMATION, validateAutomationConfig, type AutomationConfig } from "./config";

export function parseAutomationConfig(value: unknown): AutomationConfig {
  return validateAutomationConfig(
    value,
    (source) =>
      validateSyncRequest({
        source,
        startDate: "2026-01-01",
        nights: 30,
        selected: ["prayer-fajr"],
        options: {
          wakeBufferMinutes: 0,
          dawudSelected: false,
          fajrPreparationMinutes: 0,
          firstAdhanMinutes: null,
        },
      }).source,
  );
}
export async function loadAutomation(userId: string) {
  const rows = await database()`SELECT * FROM miqaat_automation WHERE user_id = ${userId}`;
  const preferences =
    await database()`SELECT prayer_configuration FROM miqaat_preferences WHERE user_id=${userId}`;
  const prayer = preferences[0]?.prayer_configuration as
    { source?: SyncSource; timezone?: string } | undefined;
  const stored = rows.length ? (rows[0]!.configuration as AutomationConfig) : DEFAULT_AUTOMATION;
  return {
    config: parseAutomationConfig({
      ...stored,
      ...(prayer?.source ? { source: prayer.source, timezone: prayer.timezone } : {}),
    }),
    state: rows[0] ?? null,
  };
}
export async function loadAccountRoutines(userId: string): Promise<Routine[]> {
  const rows =
    await database()`SELECT * FROM miqaat_routines WHERE user_id = ${userId} ORDER BY id`;
  return rows.map((row) => ({
    ...validateRoutine({
      name: row.name,
      type: row.routine_type,
      enabled: row.enabled,
      durationMinutes: row.duration_minutes,
      recurrence: row.recurrence,
      timing: row.timing_rule,
      weekdays: row.weekdays,
      calendarSyncEnabled: row.calendar_sync_enabled,
      notificationMinutes: row.notification_minutes,
    }),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
export interface ScheduleIssue {
  date: string;
  routineId?: string;
  code: string;
}
export async function generateAutomationSchedule(
  config: AutomationConfig,
  routines: readonly Routine[],
  startDate: string,
  days: number,
  load: (
    source: SyncSource,
    date: string,
  ) => Promise<{
    maghrib: string;
    fajr: string;
    timeZone: string;
    source: string;
    dailyPrayerSchedule?: DailyPrayerSchedule;
  }> = loadSyncNight,
) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error("INVALID_HORIZON");
  const events: CalendarEvent[] = [];
  const issues: ScheduleIssue[] = [];
  const fasts = fastingDates(startDate, days, config.fasting, config.fastingAnchor);
  for (const date of syncDates(startDate, days)) {
    try {
      const times = await load(config.source, date);
      if (
        times.timeZone !== config.timezone ||
        Temporal.Instant.from(times.maghrib)
          .toZonedDateTimeISO(config.timezone)
          .toPlainDate()
          .toString() !== date ||
        Temporal.Instant.from(times.fajr)
          .toZonedDateTimeISO(config.timezone)
          .toPlainDate()
          .toString() !== Temporal.PlainDate.from(date).add({ days: 1 }).toString()
      )
        throw new Error("SOURCE_DATE_MISMATCH");
      const night = calculateNightSegments(times);
      if (!times.dailyPrayerSchedule) throw new Error("PRAYER_TIMES_UNAVAILABLE");
      const prayers = buildDailyPrayerEvents(times.dailyPrayerSchedule);
      if (config.modules.includes("prayers"))
        events.push(
          ...prayers.filter((event) =>
            config.selectedPrayers.includes(
              event.id.replace("prayer-", "") as AutomationConfig["selectedPrayers"][number],
            ),
          ),
        );
      if (config.modules.includes("routines"))
        for (const routine of routines.filter((r) => r.calendarSyncEnabled)) {
          try {
            const event = buildRoutineCalendarEvent({
              routine,
              localDate: date,
              timezone: config.timezone,
              prayerSchedule: Object.fromEntries(
                prayers.map((event) => [event.id.replace("prayer-", ""), event.start]),
              ),
              nightSchedule: night,
              personalAnchors: config.personalAnchors,
              hijriDay: islamicCivilDate(date).day,
              fastingDay: fasts.some((fast) => fast.date === date),
            });
            if (event)
              events.push({ ...event, notificationMinutes: routine.notificationMinutes ?? null });
          } catch {
            issues.push({ date, routineId: routine.id, code: "ROUTINE_ANCHOR_UNAVAILABLE" });
          }
        }
      if (config.modules.includes("night")) {
        const blocks: Array<[string, string, number, number]> =
          config.night === "dawud"
            ? [
                ["dawud-initial-sleep", "Dāwūd schedule — initial sleep", 0, 3],
                ["dawud-prayer", "Dāwūd schedule — prayer", 3, 5],
                ["dawud-final-sleep", "Dāwūd schedule — final sleep", 5, 6],
              ]
            : config.qiyamWindow
              ? [["qiyam", "Qiyām", config.qiyamWindow === "final-sixth" ? 5 : 4, 6]]
              : [
                  ["night-midpoint", "Night midpoint", 3, 3],
                  ["last-third", "Last Third Begins", 4, 4],
                  ["final-sixth", "Final Sixth Begins", 5, 5],
                ];
        events.push(
          ...blocks.map(([id, title, start, end]) => ({
            id,
            title,
            serviceDate: date,
            identityScope: "night" as const,
            start: night.boundaries[start]!.instant,
            end: night.boundaries[end]!.instant,
            timeZone: config.timezone,
            description:
              "Optional personal schedule derived from the supplied Maghrib-to-Fajr night.",
          })),
        );
      }
      if (config.modules.includes("fasting"))
        events.push(
          ...fasts
            .filter((fast) => fast.date === date)
            .map((fast) => buildFastingCalendarEvent(date, fast.kind, config.timezone)),
        );
    } catch {
      issues.push({ date, code: "PRAYER_TIMES_UNAVAILABLE" });
    }
  }
  return { events: events.sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), issues };
}
