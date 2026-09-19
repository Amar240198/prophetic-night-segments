import { Temporal } from "@js-temporal/polyfill";
import { database } from "@/lib/google-calendar/database.server";
import type { GoogleSession } from "@/lib/google-calendar/session.server";
import { reconcileGoogleSchedule } from "@/lib/google-calendar/reconcile.server";
import { generateAutomationSchedule, loadAccountRoutines, loadAutomation } from "./schedule.server";
import { automationEntitlement } from "./entitlement.server";
export async function runAccountAutomation(
  userId: string,
  session: GoogleSession,
  now: string,
  remove = false,
) {
  const entitlement = await automationEntitlement(userId);
  if (!remove && !entitlement.allowed) throw new Error("AUTOMATION_PAUSED");
  const { config } = await loadAutomation(userId);
  const routines = await loadAccountRoutines(userId);
  const start = Temporal.Instant.from(now).toZonedDateTimeISO(config.timezone).toPlainDate();
  const days = config.horizon === "continuous" ? 90 : config.horizon;
  await database()`UPDATE miqaat_automation SET last_attempted_at=now() WHERE user_id=${userId}`;
  try {
    const desired = remove
      ? { events: [], issues: [] }
      : await generateAutomationSchedule(config, routines, start.toString(), days);
    // An unavailable source is never interpreted as an intentionally empty desired schedule.
    if (desired.issues.length) throw new Error("SCHEDULE_INCOMPLETE");
    const kinds = [...new Set(desired.events.map((e) => e.id))];
    if (!remove && config.removeObsolete && config.modules.includes("routines"))
      kinds.push(...routines.map((r) => `routine-${r.id}`));
    // Explicit removal covers only the current authorised module scope, never arbitrary provider events.
    if (remove) {
      if (config.modules.includes("routines"))
        kinds.push(...routines.map((r) => `routine-${r.id}`));
      if (config.modules.includes("prayers"))
        kinds.push(...config.selectedPrayers.map((p) => `prayer-${p}`));
      if (config.modules.includes("night"))
        kinds.push(
          "night-midpoint",
          "last-third",
          "final-sixth",
          "dawud-initial-sleep",
          "dawud-prayer",
          "dawud-final-sleep",
        );
      if (config.modules.includes("fasting"))
        kinds.push("fasting-monday", "fasting-thursday", "fasting-white-day");
    }
    const outcomes = kinds.length
      ? await reconcileGoogleSchedule(session, desired.events, {
          userId,
          startDate: start.toString(),
          endDate: start.add({ days: days - 1 }).toString(),
          eventKinds: [...new Set(kinds)],
          allowRemoval: remove || config.removeObsolete,
          notBefore: now,
        })
      : [];
    const failed = outcomes.some((o) => o.action === "BLOCKED");
    await database()`UPDATE miqaat_automation SET last_success_at=CASE WHEN ${failed} THEN last_success_at ELSE now() END,
      last_error_code=${failed ? "SYNC_INCOMPLETE" : null}, consecutive_failures=CASE WHEN ${failed} THEN consecutive_failures+1 ELSE 0 END,
      next_sync_at=now()+interval '24 hours', enabled=CASE WHEN ${remove} THEN false ELSE enabled END WHERE user_id=${userId}`;
    console.info(
      JSON.stringify({
        event: "automation_sync",
        result: failed ? "partial" : "success",
        count: outcomes.length,
      }),
    );
    return { outcomes, issues: desired.issues };
  } catch (error) {
    const code =
      error instanceof Error && ["SCHEDULE_INCOMPLETE", "AUTOMATION_PAUSED"].includes(error.message)
        ? error.message
        : "SYNC_FAILED";
    await database()`UPDATE miqaat_automation SET last_error_code=${code},consecutive_failures=consecutive_failures+1,next_sync_at=now()+interval '1 hour' WHERE user_id=${userId}`;
    throw new Error(code);
  }
}
