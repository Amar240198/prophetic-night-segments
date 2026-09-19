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
export interface Routine {
  id: string;
  name: string;
  type: RoutineType;
  enabled: boolean;
  durationMinutes: number;
  recurrence: "daily" | "weekdays";
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
    (input.recurrence !== undefined && !["daily", "weekdays"].includes(input.recurrence)) ||
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
  return {
    name: input.name.trim(),
    type: input.type,
    enabled: input.enabled !== false,
    durationMinutes: input.durationMinutes,
    recurrence: input.recurrence ?? "daily",
    timing: input.timing,
  };
}
