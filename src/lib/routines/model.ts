export type RoutineType =
  "quran" | "dhikr" | "qiyam" | "tahajjud" | "suhoor" | "sleep-preparation" | "custom";
export const ROUTINE_ANCHORS = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
  "last-third",
  "night_midpoint",
  "last_third_start",
  "final_sixth_start",
  "bedtime",
  "wake_time",
  "jumuah",
] as const;
export type RoutineAnchor = (typeof ROUTINE_ANCHORS)[number];
export type TimingRule =
  | { kind: "fixed"; time: string }
  | { kind: "relative"; anchor: RoutineAnchor; offsetMinutes: number };
export type RoutineRecurrence =
  | "daily"
  | "weekdays"
  | "selected-weekdays"
  | "friday"
  | "monday"
  | "thursday"
  | "white-days"
  | "fasting-days";
export interface Routine {
  id: string;
  name: string;
  type: RoutineType;
  enabled: boolean;
  durationMinutes: number;
  recurrence: RoutineRecurrence;
  weekdays?: number[];
  calendarSyncEnabled?: boolean;
  notificationMinutes?: number | null;
  timing: TimingRule;
  createdAt: string;
  updatedAt: string;
}
export function validateRoutine(
  input: Partial<Routine>,
): Omit<Routine, "id" | "createdAt" | "updatedAt"> {
  if (
    typeof input.name !== "string" ||
    !input.name.trim() ||
    input.name.trim().length > 120 ||
    !["quran", "dhikr", "qiyam", "tahajjud", "suhoor", "sleep-preparation", "custom"].includes(
      String(input.type),
    ) ||
    (input.enabled !== undefined && typeof input.enabled !== "boolean") ||
    (input.recurrence !== undefined &&
      ![
        "daily",
        "weekdays",
        "selected-weekdays",
        "friday",
        "monday",
        "thursday",
        "white-days",
        "fasting-days",
      ].includes(input.recurrence)) ||
    !input.type ||
    !input.timing ||
    input.durationMinutes === undefined ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 0 ||
    input.durationMinutes > 1440
  )
    throw new Error("INVALID_ROUTINE");
  if (!["fixed", "relative"].includes(input.timing.kind)) throw new Error("INVALID_ROUTINE");
  if (input.timing.kind === "fixed" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.timing.time))
    throw new Error("INVALID_ROUTINE");
  if (
    input.timing.kind === "relative" &&
    (!ROUTINE_ANCHORS.includes(input.timing.anchor) ||
      !Number.isInteger(input.timing.offsetMinutes) ||
      input.timing.offsetMinutes < -1440 ||
      input.timing.offsetMinutes > 1440)
  )
    throw new Error("INVALID_ROUTINE");
  if (
    input.weekdays !== undefined &&
    (!Array.isArray(input.weekdays) ||
      input.weekdays.length > 7 ||
      input.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7))
  )
    throw new Error("INVALID_ROUTINE");
  if (input.recurrence === "selected-weekdays" && !input.weekdays?.length)
    throw new Error("INVALID_ROUTINE");
  if (input.calendarSyncEnabled !== undefined && typeof input.calendarSyncEnabled !== "boolean")
    throw new Error("INVALID_ROUTINE");
  if (
    input.notificationMinutes !== undefined &&
    input.notificationMinutes !== null &&
    ![0, 5, 10, 15, 30].includes(input.notificationMinutes)
  )
    throw new Error("INVALID_ROUTINE");
  return {
    weekdays: [...new Set(input.weekdays ?? [])],
    calendarSyncEnabled: input.calendarSyncEnabled ?? false,
    notificationMinutes: input.notificationMinutes ?? null,
    name: input.name.trim(),
    type: input.type,
    enabled: input.enabled !== false,
    durationMinutes: input.durationMinutes,
    recurrence: input.recurrence ?? "daily",
    timing: input.timing,
  };
}
