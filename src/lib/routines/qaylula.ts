import { validateRoutine, type Routine } from "./model";
import { resolveRoutineOccurrence } from "./resolve";
import type { DailyPrayerSchedule } from "@/lib/calendar/buildCalendarEvents";
export interface QaylulaConfig {
  relation: "before" | "after";
  offsetMinutes: number;
  durationMinutes: number;
  enabled: boolean;
}
export const DEFAULT_QAYLULA: QaylulaConfig = {
  relation: "after",
  offsetMinutes: 15,
  durationMinutes: 20,
  enabled: true,
};
export function parseQaylula(value: unknown): QaylulaConfig {
  if (!value || typeof value !== "object") throw new Error("INVALID_QAYLULA");
  const v = value as QaylulaConfig;
  if (
    !["before", "after"].includes(v.relation) ||
    !Number.isInteger(v.offsetMinutes) ||
    v.offsetMinutes < 0 ||
    v.offsetMinutes > 1440 ||
    !Number.isInteger(v.durationMinutes) ||
    v.durationMinutes < 1 ||
    v.durationMinutes > 1440 ||
    typeof v.enabled !== "boolean"
  )
    throw new Error("INVALID_QAYLULA");
  return {
    relation: v.relation,
    offsetMinutes: v.offsetMinutes,
    durationMinutes: v.durationMinutes,
    enabled: v.enabled,
  };
}
export function qaylulaRoutine(value: QaylulaConfig): Routine {
  const config = parseQaylula(value);
  return {
    ...validateRoutine({
      name: "Qaylula",
      type: "qaylula",
      enabled: config.enabled,
      durationMinutes: config.durationMinutes,
      recurrence: "daily",
      calendarSyncEnabled: false,
      notificationMinutes: null,
      timing: {
        kind: "relative",
        anchor: "dhuhr",
        offsetMinutes: config.offsetMinutes * (config.relation === "before" ? -1 : 1),
      },
    }),
    id: "qaylula-preview",
    createdAt: "1970-01-01T00:00:00Z",
    updatedAt: "1970-01-01T00:00:00Z",
  };
}
export function resolveQaylula(config: QaylulaConfig, schedule: DailyPrayerSchedule) {
  return resolveRoutineOccurrence({
    routine: qaylulaRoutine(config),
    localDate: schedule.date,
    timezone: schedule.timeZone,
    prayerSchedule: schedule,
  });
}
