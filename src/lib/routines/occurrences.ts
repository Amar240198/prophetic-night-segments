import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { resolveRoutineOccurrence, type RoutineResolutionInput } from "./resolve";

/** Provider-neutral desired event. The ownership ledger allocates appEventId separately. */
export function buildRoutineCalendarEvent(input: RoutineResolutionInput): CalendarEvent | null {
  const occurrence = resolveRoutineOccurrence(input);
  if (!occurrence) return null;
  return {
    id: `routine-${occurrence.routineId}`,
    serviceDate: occurrence.localDate,
    identityScope: "routine",
    title: input.routine.name,
    start: occurrence.start,
    end: occurrence.end,
    description: `Optional personal routine. ${occurrence.humanReadableRule}.`,
    timeZone: occurrence.timezone,
  };
}
