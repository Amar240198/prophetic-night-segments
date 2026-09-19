import { Temporal } from "@js-temporal/polyfill";
import type { NightCalculationResult } from "@prophetic-night/night-engine";
import { validateRoutine, type Routine, type RoutineAnchor } from "./model";

export class RoutineResolutionError extends Error {
  constructor(
    public readonly code: "MISSING_ANCHOR" | "INVALID_ANCHOR" | "INVALID_ROUTINE_CONTEXT",
  ) {
    super(code);
  }
}

export function humanReadableRule(routine: Pick<Routine, "timing">): string {
  const rule = routine.timing;
  if (rule.kind === "fixed") return `At ${rule.time}`;
  const anchor = rule.anchor.replaceAll("_", " ").replaceAll("-", " ");
  return rule.offsetMinutes === 0
    ? `At ${anchor}`
    : `${Math.abs(rule.offsetMinutes)} minutes ${rule.offsetMinutes < 0 ? "before" : "after"} ${anchor}`;
}

/** Instant-valued prayer/night inputs must already be resolved by their source. */
export interface RoutineResolutionInput {
  routine: Routine;
  localDate: string;
  timezone: string;
  prayerSchedule?: Partial<Record<RoutineAnchor, string>>;
  nightSchedule?: NightCalculationResult;
  hijriDay?: number;
  fastingDay?: boolean;
  personalAnchors?: Partial<Record<"bedtime" | "wake_time" | "jumuah", string>>;
}

export interface RoutineOccurrence {
  /** Scoped to the account by the persistence layer, never derived from mutable times. */
  logicalOccurrenceId: string;
  routineId: string;
  localDate: string;
  start: string;
  end: string;
  anchorResolvedAt: string;
  timezone: string;
  humanReadableRule: string;
}

export function resolveRoutineOccurrence(input: RoutineResolutionInput): RoutineOccurrence | null {
  const { routine, localDate, timezone, nightSchedule: night } = input;
  validateRoutine(routine);
  try {
    const date = Temporal.PlainDate.from(localDate);
    if (date.toString() !== localDate || !routine.id) throw new Error();
    const localInstant = (time: string) =>
      date
        .toPlainDateTime(Temporal.PlainTime.from(time))
        .toZonedDateTime(timezone, { disambiguation: "reject" })
        .toInstant();
    // Validate the timezone even when no occurrence is due.
    Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone);
    if (!routine.enabled || (routine.recurrence === "weekdays" && date.dayOfWeek > 5)) return null;
    if (routine.recurrence === "selected-weekdays" && !routine.weekdays?.includes(date.dayOfWeek))
      return null;
    const weekday = { friday: 5, monday: 1, thursday: 4 }[
      routine.recurrence as "friday" | "monday" | "thursday"
    ];
    if (weekday && date.dayOfWeek !== weekday) return null;
    if (routine.recurrence === "white-days") {
      if (input.hijriDay === undefined) throw new RoutineResolutionError("MISSING_ANCHOR");
      if (![13, 14, 15].includes(input.hijriDay)) return null;
    }
    if (routine.recurrence === "fasting-days") {
      if (input.fastingDay === undefined) throw new RoutineResolutionError("MISSING_ANCHOR");
      if (!input.fastingDay) return null;
    }
    let anchor: Temporal.Instant;
    const timing = routine.timing;
    if (timing.kind === "fixed") anchor = localInstant(timing.time);
    else {
      const key = timing.anchor;
      const personal = key === "bedtime" || key === "wake_time" || key === "jumuah";
      const nightAnchor = [
        "last-third",
        "last_third_start",
        "night_midpoint",
        "final_sixth_start",
      ].includes(key);
      if (personal) {
        const clock = input.personalAnchors?.[key];
        if (!clock) throw new RoutineResolutionError("MISSING_ANCHOR");
        anchor = localInstant(clock);
      } else if (nightAnchor) {
        if (!night) throw new RoutineResolutionError("MISSING_ANCHOR");
        if (
          Temporal.Instant.from(night.night.start)
            .toZonedDateTimeISO(timezone)
            .toPlainDate()
            .toString() !== localDate
        )
          throw new RoutineResolutionError("INVALID_ANCHOR");
        anchor = Temporal.Instant.from(
          key === "night_midpoint"
            ? night.boundaries[3]!.instant
            : key === "final_sixth_start"
              ? night.boundaries[5]!.instant
              : night.boundaries[4]!.instant,
        );
      } else {
        const instant = input.prayerSchedule?.[key];
        if (!instant) throw new RoutineResolutionError("MISSING_ANCHOR");
        anchor = Temporal.Instant.from(instant);
        if (anchor.toZonedDateTimeISO(timezone).toPlainDate().toString() !== localDate)
          throw new RoutineResolutionError("INVALID_ANCHOR");
      }
    }
    const start = anchor.add({ minutes: timing.kind === "relative" ? timing.offsetMinutes : 0 });
    return {
      logicalOccurrenceId: JSON.stringify([routine.id, localDate]),
      routineId: routine.id,
      localDate,
      start: start.toString(),
      end: start.add({ minutes: routine.durationMinutes }).toString(),
      anchorResolvedAt: anchor.toString(),
      timezone,
      humanReadableRule: humanReadableRule(routine),
    };
  } catch (error) {
    if (error instanceof RoutineResolutionError) throw error;
    throw new RoutineResolutionError("INVALID_ROUTINE_CONTEXT");
  }
}
