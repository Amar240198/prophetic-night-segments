import { GoogleCalendarError } from "./errors";

/**
 * Emergency, reversible write fence used while production schema changes are applied.
 * It intentionally depends only on an environment variable so it works before and
 * after the calendar ownership migration.
 */
export function assertCalendarMutationsEnabled() {
  if (process.env.CALENDAR_MUTATIONS_PAUSED === "true")
    throw new GoogleCalendarError("CALENDAR_MAINTENANCE", 503);
}
