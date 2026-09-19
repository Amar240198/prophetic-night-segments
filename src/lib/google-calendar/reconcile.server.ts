import { Temporal } from "@js-temporal/polyfill";
import { randomUUID } from "node:crypto";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { planCalendarReconciliation, type CurrentCalendarEntry } from "@/lib/calendar/reconcile";
import { findOwnedEvent } from "@/lib/calendar/repository.server";
import { isServiceDate } from "@/lib/calendar/ownership";
import { database } from "./database.server";
import { GoogleCalendarError } from "./errors";
import { googleEventPayload, googleFailure } from "./events.server";
import { googleOwnershipAdapter } from "./ownership.server";
import { removeGoogleEvent } from "./remove-event.server";
import { syncGoogleEvent } from "./sync-event.server";
import {
  acquireSyncLease,
  releaseSyncLease,
  removeEventMapping,
  assertCalendarWriteAccess,
} from "./sync-database.server";
import { assertCalendarMutationsEnabled } from "./maintenance.server";
import type { GoogleSession } from "./session.server";

export interface ManagedScope {
  userId: string;
  startDate: string;
  endDate: string;
  eventKinds: readonly string[];
  allowRemoval: boolean;
  notBefore?: string;
}
export interface ManagedOutcome {
  date: string;
  eventKind: string;
  action: "CREATE" | "UPDATE" | "KEEP" | "REMOVE" | "BLOCKED";
  code?: string;
}
const logicalId = (date: string, kind: string) => JSON.stringify([date, kind]);

/** Account binding is an explicit consequence of a signed-in user's sync action. */
export async function bindCalendarAccount(session: GoogleSession, userId: string) {
  const rows = await database()`UPDATE google_connections SET user_id = ${userId}
    WHERE id = ${session.connectionId} AND google_subject = ${session.subject}
      AND provider = 'google' AND disconnected_at IS NULL
      AND (user_id IS NULL OR user_id = ${userId}) RETURNING id`;
  if (rows.length !== 1) throw new GoogleCalendarError("FORBIDDEN", 403);
}

/** Never accept event kinds or desired content directly from an untrusted browser. */
export async function reconcileGoogleSchedule(
  session: GoogleSession,
  desiredEvents: readonly CalendarEvent[],
  scope: ManagedScope,
): Promise<ManagedOutcome[]> {
  assertCalendarMutationsEnabled();
  if (
    !isServiceDate(scope.startDate) ||
    !isServiceDate(scope.endDate) ||
    scope.endDate < scope.startDate ||
    !scope.eventKinds.length ||
    scope.eventKinds.length > 150 ||
    new Set(scope.eventKinds).size !== scope.eventKinds.length
  )
    throw new GoogleCalendarError("INVALID_REQUEST");
  const days = Temporal.PlainDate.from(scope.startDate).until(scope.endDate).days + 1;
  if (days < 1 || days > 90) throw new GoogleCalendarError("INVALID_REQUEST");
  const kinds = new Set(scope.eventKinds);
  const desired = desiredEvents.map((event) => {
    if (
      !event.serviceDate ||
      event.serviceDate < scope.startDate ||
      event.serviceDate > scope.endDate ||
      !kinds.has(event.id)
    )
      throw new GoogleCalendarError("INVALID_REQUEST");
    return { logicalId: logicalId(event.serviceDate, event.id), event };
  });
  if (new Set(desired.map((item) => item.logicalId)).size !== desired.length)
    throw new GoogleCalendarError("INVALID_REQUEST");
  const owner = randomUUID();
  if (!(await acquireSyncLease(session.connectionId, owner)))
    throw new GoogleCalendarError("SYNC_IN_PROGRESS", 409);
  const leased = { ...session, operationOwner: owner };
  const outcomes: ManagedOutcome[] = [];
  const deadline = Date.now() + 230_000;
  try {
    const authorized =
      await database()`SELECT id FROM google_connections WHERE id = ${session.connectionId}
      AND user_id = ${scope.userId} AND google_subject = ${session.subject} AND disconnected_at IS NULL`;
    if (authorized.length !== 1) throw new GoogleCalendarError("FORBIDDEN", 403);
    const rows = await database()`SELECT local_night::text AS date, event_type AS kind
      FROM google_calendar_event_mappings WHERE google_connection_id = ${session.connectionId}
      AND calendar_id = 'primary' AND local_night BETWEEN ${scope.startDate}::date AND ${scope.endDate}::date
      AND event_type = ANY(${scope.eventKinds}::text[])`;
    const identities = new Map(
      desired.map((entry) => [
        entry.logicalId,
        { date: entry.event.serviceDate!, kind: entry.event.id },
      ]),
    );
    for (const row of rows)
      identities.set(logicalId(row.date, row.kind), { date: row.date, kind: row.kind });
    const allowedLogicalIds = new Set(identities.keys());
    for (const [id, identity] of identities) {
      const { date, kind } = identity;
      try {
        if (Date.now() > deadline || session.accessExpiresAt < Date.now() + 15000)
          throw new GoogleCalendarError("SYNC_INCOMPLETE", 409);
        assertCalendarMutationsEnabled();
        await assertCalendarWriteAccess(leased);
        const mapping = await findOwnedEvent(session.connectionId, date, kind);
        if (mapping?.deletedAt) {
          outcomes.push({ date, eventKind: kind, action: "BLOCKED", code: "EVENT_DELETED" });
          continue;
        }
        const wanted = desired.find((entry) => entry.logicalId === id);
        if (
          wanted &&
          scope.notBefore &&
          Temporal.Instant.compare(wanted.event.start, scope.notBefore) < 0
        ) {
          outcomes.push({ date, eventKind: kind, action: "KEEP" });
          continue;
        }
        const current: CurrentCalendarEntry[] = [];
        if (mapping) {
          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(mapping.providerEventId)}`,
            {
              headers: { Authorization: `Bearer ${session.accessToken}` },
              cache: "no-store",
              signal: AbortSignal.timeout(6000),
            },
          );
          if (![404, 410].includes(response.status)) {
            if (!response.ok) throw await googleFailure(response);
            const body = await response.json();
            if (body.status === "cancelled") throw new GoogleCalendarError("EVENT_DELETED", 409);
            if (!googleOwnershipAdapter.verifyOwnership(body, mapping))
              throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
            if (
              scope.notBefore &&
              body.start?.dateTime &&
              Temporal.Instant.compare(body.start.dateTime, scope.notBefore) < 0
            ) {
              outcomes.push({ date, eventKind: kind, action: "KEEP" });
              continue;
            }
            const expected = wanted ? googleEventPayload(wanted.event) : null;
            const same =
              expected &&
              body.summary === expected.summary &&
              body.description === expected.description &&
              body.start?.dateTime &&
              body.end?.dateTime &&
              Temporal.Instant.compare(body.start.dateTime, expected.start.dateTime) === 0 &&
              Temporal.Instant.compare(body.end.dateTime, expected.end.dateTime) === 0 &&
              body.start.timeZone === expected.start.timeZone &&
              body.end.timeZone === expected.end.timeZone &&
              JSON.stringify(body.reminders) === JSON.stringify(expected.reminders);
            current.push({
              logicalId: id,
              providerId: mapping.providerEventId,
              ownershipVerified: true,
              tombstoned: false,
              event: same
                ? wanted!.event
                : {
                    id: kind,
                    serviceDate: date,
                    title: body.summary ?? "",
                    description: body.description ?? "",
                    start: body.start?.dateTime ?? "",
                    end: body.end?.dateTime ?? "",
                    timeZone: body.start?.timeZone ?? "",
                  },
            });
          } else if (response.status === 410) throw new GoogleCalendarError("EVENT_DELETED", 409);
          else if (!wanted && scope.allowRemoval) {
            await removeEventMapping(session.connectionId, date, kind, mapping.providerEventId);
            outcomes.push({ date, eventKind: kind, action: "REMOVE" });
            continue;
          }
        }
        const plan = planCalendarReconciliation(wanted ? [wanted] : [], current, {
          ...scope,
          allowedLogicalIds,
        });
        if (plan.blocked.length)
          outcomes.push({ date, eventKind: kind, action: "BLOCKED", code: "EVENT_NOT_OWNED" });
        else if (plan.remove.length && mapping) {
          await removeGoogleEvent(mapping, leased);
          await removeEventMapping(session.connectionId, date, kind, mapping.providerEventId);
          outcomes.push({ date, eventKind: kind, action: "REMOVE" });
        } else if (plan.keep.length) outcomes.push({ date, eventKind: kind, action: "KEEP" });
        else if (wanted) {
          const result = await syncGoogleEvent(leased, date, wanted.event, true);
          outcomes.push({
            date,
            eventKind: kind,
            action: result === "created" ? "CREATE" : result === "updated" ? "UPDATE" : "KEEP",
          });
        }
      } catch (error) {
        const code = error instanceof GoogleCalendarError ? error.code : "EVENT_FAILED";
        outcomes.push({ date, eventKind: kind, action: "BLOCKED", code });
        if (
          ["RATE_LIMITED", "SESSION_EXPIRED", "PERMISSION_DENIED", "SYNC_INCOMPLETE"].includes(code)
        )
          break;
      }
    }
    return outcomes;
  } finally {
    await releaseSyncLease(session.connectionId, owner).catch(() => undefined);
  }
}
