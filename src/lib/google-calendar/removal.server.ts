import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { NextRequest } from "next/server";
import { GoogleCalendarError, type GoogleErrorCode } from "./errors";
import { FIXED_SYNC_HORIZONS, CONTINUOUS_SYNC_NIGHTS } from "./sync";
import { syncDates } from "./sync-plan.server";
import { readSession, type GoogleSession } from "./session.server";
import {
  acquireSyncLease,
  releaseSyncLease,
  removeEventMapping,
  removeSyncSelection,
  assertSelectionRevision,
} from "./sync-database.server";
import { removeGoogleEvent } from "./remove-event.server";
import type { RemovalRequest, RemovalOutcome, RemovalResult } from "./removal";
import { findOwnedEvent, reserveOwnedEvent } from "@/lib/calendar/repository.server";
import { recoverGoogleMapping } from "./recovery.server";
import { isServiceDate } from "@/lib/calendar/ownership";
import { database } from "./database.server";

function validRemovalTypes(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 32 &&
    new Set(value).size === value.length &&
    value.every((id) => typeof id === "string" && /^[a-z][a-z0-9-]{0,99}$/.test(id))
  );
}

export function validateRemovalRequest(value: unknown): RemovalRequest {
  try {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    const body = value as Record<string, unknown>;
    if (body.startDate !== undefined) {
      if (typeof body.startDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.startDate))
        throw new Error();
      const date = Temporal.PlainDate.from(body.startDate);
      if (date.year < 2000 || date.year > 2100) throw new Error();
    }
    if (body.scope === "night") {
      const events = body.events;
      if (
        events !== undefined &&
        (!Array.isArray(events) || events.some((event) => !event || typeof event !== "object"))
      )
        throw new Error();
      const startDate =
        body.startDate ?? (Array.isArray(events) ? events[0]?.serviceDate : undefined);
      if (!isServiceDate(startDate)) throw new GoogleCalendarError("SERVICE_DATE_REQUIRED");
      if (
        Array.isArray(events) &&
        events.some((event) => event.serviceDate !== undefined && event.serviceDate !== startDate)
      )
        throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
      const selected =
        body.selected ?? (Array.isArray(events) ? events.map((event) => event.id) : undefined);
      if (!validRemovalTypes(selected)) throw new Error();
      return { scope: "night", selected, startDate };
    }
    if (
      body.scope !== "horizon" ||
      typeof body.startDate !== "string" ||
      (body.mode !== "fixed" && body.mode !== "continuous") ||
      typeof body.nights !== "number" ||
      !Number.isInteger(body.nights) ||
      (body.mode === "continuous"
        ? body.nights !== CONTINUOUS_SYNC_NIGHTS
        : !FIXED_SYNC_HORIZONS.includes(body.nights)) ||
      (body.allEventTypes !== undefined && typeof body.allEventTypes !== "boolean") ||
      !(
        validRemovalTypes(body.selected) ||
        (body.allEventTypes === true && Array.isArray(body.selected) && body.selected.length === 0)
      )
    )
      throw new Error();
    if (
      body.selectionRevision !== undefined &&
      body.selectionRevision !== null &&
      (typeof body.selectionRevision !== "string" || body.selectionRevision.length > 100)
    )
      throw new Error();
    return {
      scope: "horizon",
      startDate: body.startDate,
      mode: body.mode,
      nights: body.nights,
      selected: body.selected,
      ...(body.allEventTypes === true ? { allEventTypes: true } : {}),
      ...(body.selectionRevision !== undefined
        ? { selectionRevision: body.selectionRevision as string | null }
        : {}),
    };
  } catch (error) {
    if (error instanceof GoogleCalendarError) throw error;
    throw new GoogleCalendarError("INVALID_REQUEST");
  }
}

export async function removeCalendarEvents(
  input: RemovalRequest,
  request: NextRequest,
  initial: GoogleSession,
  now: () => number = Date.now,
): Promise<RemovalResult> {
  const owner = randomUUID();
  if (!(await acquireSyncLease(initial.connectionId, owner)))
    throw new GoogleCalendarError("SYNC_IN_PROGRESS", 409);
  const deadline = now() + 250_000;
  const result: RemovalResult = {
    scope: input.scope,
    nights: input.scope === "night" ? 1 : input.nights,
    outcomes: [],
  };
  type Target = { date: string; id: string; identity: "mapped" };
  let stopCode: GoogleErrorCode | undefined;
  try {
    let allTargets: Target[] | undefined;
    if (input.scope === "horizon") {
      await assertSelectionRevision(initial.connectionId, input.selectionRevision);
      if (input.allEventTypes) {
        const dates = syncDates(input.startDate, input.nights);
        const rows = await database()`SELECT local_night::text AS date, event_type AS id
          FROM google_calendar_event_mappings WHERE google_connection_id = ${initial.connectionId}
            AND calendar_id = 'primary' AND local_night BETWEEN ${dates[0]}::date AND ${dates.at(-1)}::date
          ORDER BY local_night, event_type LIMIT 2881`;
        if (rows.length > 2880) throw new GoogleCalendarError("REMOVE_INCOMPLETE", 409);
        allTargets = rows.map((row) => ({
          date: row.date as string,
          id: row.id as string,
          identity: "mapped",
        }));
        // Clear every saved type, including retired types, before external deletion.
        await database()`DELETE FROM google_calendar_sync_preferences WHERE google_connection_id = ${initial.connectionId}`;
      }
      // Persist removal intent BEFORE external writes, including when Google later fails.
      result.syncSelection = await removeSyncSelection(initial.connectionId, input.selected);
    }
    const targets: Target[] =
      allTargets ??
      (input.scope === "horizon"
        ? syncDates(input.startDate, input.nights).flatMap((date) =>
            input.selected.map((id) => ({ date, id, identity: "mapped" as const })),
          )
        : (input.selected ?? input.events.map((event) => event.id)).map((id) => ({
            date: input.startDate!,
            id,
            identity: "mapped" as const,
          })));
    const outcomes: RemovalOutcome[] = new Array(targets.length);
    let cursor = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, targets.length) }, async () => {
        while (cursor < targets.length) {
          const index = cursor++;
          const target = targets[index]!;
          const outcome = {
            id: target.id,
            identity: target.identity,
            ...(target.date ? { date: target.date } : {}),
          };
          let attemptedGoogle = false;
          try {
            if (now() >= deadline - 45_000) stopCode ??= "REMOVE_INCOMPLETE";
            if (stopCode) throw new GoogleCalendarError(stopCode);
            const session = await readSession(request);
            if (
              session.connectionId !== initial.connectionId ||
              session.accessExpiresAt <= now() + 30_000
            )
              throw new GoogleCalendarError("SESSION_EXPIRED", 401);
            if (stopCode) throw new GoogleCalendarError(stopCode);
            let mapping = await findOwnedEvent(session.connectionId, target.date, target.id);
            if (!mapping) {
              attemptedGoogle = true;
              const recovered = await recoverGoogleMapping(session, target.date, target.id);
              if (recovered)
                mapping = await reserveOwnedEvent(
                  session.connectionId,
                  target.date,
                  target.id,
                  null,
                  recovered,
                );
            }
            if (stopCode) throw new GoogleCalendarError(stopCode);
            attemptedGoogle ||= Boolean(mapping);
            const status = mapping
              ? await removeGoogleEvent(mapping, { ...session, operationOwner: owner })
              : "absent";
            // Keep a tombstone, including the original provider identity, for safe retries.
            if (mapping)
              await removeEventMapping(
                session.connectionId,
                target.date,
                target.id,
                mapping.providerEventId,
              );
            outcomes[index] = { ...outcome, status };
          } catch (error) {
            const rawCode = error instanceof GoogleCalendarError ? error.code : "REMOVE_FAILED";
            const code = rawCode === "EVENT_FAILED" ? "REMOVE_FAILED" : rawCode;
            outcomes[index] = { ...outcome, status: "failed", code };
            if (
              ["RATE_LIMITED", "PERMISSION_DENIED", "SESSION_EXPIRED", "UNAUTHENTICATED"].includes(
                code,
              )
            )
              stopCode = code;
          } finally {
            if (attemptedGoogle) await new Promise((resolve) => setTimeout(resolve, 300));
          }
        }
      }),
    );
    result.outcomes = outcomes;
    return result;
  } finally {
    await releaseSyncLease(initial.connectionId, owner).catch(() => undefined);
  }
}
