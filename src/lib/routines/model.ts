export type RoutineType =
  "quran" | "dhikr" | "qiyam" | "tahajjud" | "suhoor" | "sleep-preparation" | "custom";
export type TimingRule =
  | { kind: "fixed"; time: string }
  | { kind: "relative"; anchor: "fajr" | "maghrib" | "isha" | "last-third"; offsetMinutes: number };
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
    !input.name?.trim() ||
    !input.type ||
    !input.timing ||
    input.durationMinutes === undefined ||
    !Number.isInteger(input.durationMinutes) ||
    input.durationMinutes < 0 ||
    input.durationMinutes > 1440
  )
    throw new Error("INVALID_ROUTINE");
  if (input.timing.kind === "fixed" && !/^\d{2}:\d{2}$/.test(input.timing.time))
    throw new Error("INVALID_ROUTINE");
  if (
    input.timing.kind === "relative" &&
    (!Number.isInteger(input.timing.offsetMinutes) ||
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
