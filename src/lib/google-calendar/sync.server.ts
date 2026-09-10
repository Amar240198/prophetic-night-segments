import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { GoogleCalendarError, type GoogleErrorCode } from "./errors";
import { readSession, type GoogleSession } from "./session.server";
import {
  acquireSyncLease,
  releaseSyncLease,
  saveSyncPreference,
  assertSelectionRevision,
  readSyncSelection,
} from "./sync-database.server";
import { calculateSyncNight, syncDates } from "./sync-plan.server";
import { syncGoogleEvent } from "./sync-event.server";
import type { SyncRequest, SyncOutcome, SyncResult } from "./sync";
import type { GoogleEventId } from "./plan";

// Bounded parallel nights keep larger horizons practical without an unbounded API burst.
const SYNC_CONCURRENCY = 3;
export async function syncCalendar(
  input: SyncRequest,
  request: NextRequest,
  initial: GoogleSession,
): Promise<SyncResult> {
  const owner = randomUUID();
  if (!(await acquireSyncLease(initial.connectionId, owner)))
    throw new GoogleCalendarError("SYNC_IN_PROGRESS", 409);
  const deadline = Date.now() + 250_000;
  const dates = syncDates(input.startDate, input.nights);
  const nights: SyncOutcome[][] = new Array(dates.length);
  let stopCode: GoogleErrorCode | undefined;
  const failedNight = (date: string, code: GoogleErrorCode): SyncOutcome[] =>
    input.selected.map((id) => ({ date, id, status: "failed", code }));
  async function syncNight(date: string): Promise<SyncOutcome[]> {
    if (Date.now() >= deadline - 60_000) stopCode ??= "SYNC_INCOMPLETE";
    if (stopCode) return failedNight(date, stopCode);
    let events;
    try {
      events = await calculateSyncNight(input, date);
    } catch {
      return failedNight(date, "PRAYER_TIMES_UNAVAILABLE");
    }
    if (stopCode) return failedNight(date, stopCode);
    let session: GoogleSession;
    try {
      session = await readSession(request);
      if (session.connectionId !== initial.connectionId)
        throw new GoogleCalendarError("SESSION_EXPIRED", 401);
    } catch (error) {
      stopCode = error instanceof GoogleCalendarError ? error.code : "CONNECTION_FAILED";
      return failedNight(date, stopCode);
    }
    const outcomes: SyncOutcome[] = [];
    for (const event of events) {
      if (Date.now() >= deadline - 45_000) stopCode ??= "SYNC_INCOMPLETE";
      if (session.accessExpiresAt <= Date.now() + 30_000) stopCode ??= "SESSION_EXPIRED";
      const id = event.id as GoogleEventId;
      if (stopCode) {
        outcomes.push({ date, id, status: "failed", code: stopCode });
        continue;
      }
      try {
        const status = await syncGoogleEvent(session, date, event);
        outcomes.push({ date, id, status });
      } catch (error) {
        const code = error instanceof GoogleCalendarError ? error.code : "EVENT_FAILED";
        outcomes.push({ date, id, status: "failed", code });
        // Only already-in-flight operations may finish after quota/auth failures.
        if (["RATE_LIMITED", "PERMISSION_DENIED", "SESSION_EXPIRED"].includes(code))
          stopCode = code;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return outcomes;
  }
  try {
    await assertSelectionRevision(initial.connectionId, input.selectionRevision);
    // Save the user's intent before any external event writes, even if the run is partial.
    // The lease serializes competing preferences; disconnect cascades this row away.
    await saveSyncPreference(initial.connectionId, input);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(SYNC_CONCURRENCY, dates.length) }, async () => {
        while (cursor < dates.length) {
          const index = cursor++;
          nights[index] = await syncNight(dates[index]!);
        }
      }),
    );
    const outcomes = nights.flat();
    const syncedNights = nights.filter(
      (night) =>
        night.length === input.selected.length && night.every((item) => item.status !== "failed"),
    ).length;
    return {
      nights: input.nights,
      syncedNights,
      outcomes,
      syncSelection: await readSyncSelection(initial.connectionId),
    };
  } finally {
    // A failed release expires automatically; do not hide accurate event results.
    await releaseSyncLease(initial.connectionId, owner).catch(() => undefined);
  }
}
