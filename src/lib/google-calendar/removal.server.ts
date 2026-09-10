import { randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { NextRequest } from "next/server";
import { GoogleCalendarError, type GoogleErrorCode } from "./errors";
import { googleEventPayload, validateSelectedEvents } from "./events.server";
import { GOOGLE_EVENT_TITLES, type GoogleEventId } from "./plan";
import { FIXED_SYNC_HORIZONS, CONTINUOUS_SYNC_NIGHTS } from "./sync";
import { syncDates } from "./sync-plan.server";
import { readSession, type GoogleSession } from "./session.server";
import {
  acquireSyncLease,
  releaseSyncLease,
  findEventMapping,
  removeEventMapping,
  removeSyncSelection,
  assertSelectionRevision,
} from "./sync-database.server";
import { removeGoogleEvent } from "./remove-event.server";
import type { RemovalRequest, RemovalOutcome, RemovalResult } from "./removal";

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
    if (body.scope === "night")
      return {
        scope: "night",
        events: validateSelectedEvents(body),
        ...(body.startDate !== undefined ? { startDate: body.startDate as string } : {}),
      };
    if (
      body.scope !== "horizon" ||
      typeof body.startDate !== "string" ||
      (body.mode !== "fixed" && body.mode !== "continuous") ||
      typeof body.nights !== "number" ||
      !Number.isInteger(body.nights) ||
      (body.mode === "continuous"
        ? body.nights !== CONTINUOUS_SYNC_NIGHTS
        : !FIXED_SYNC_HORIZONS.includes(body.nights)) ||
      !Array.isArray(body.selected) ||
      body.selected.length < 1 ||
      body.selected.length > Object.keys(GOOGLE_EVENT_TITLES).length ||
      new Set(body.selected).size !== body.selected.length ||
      body.selected.some((id) => typeof id !== "string" || !Object.hasOwn(GOOGLE_EVENT_TITLES, id))
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
      selected: body.selected as GoogleEventId[],
      ...(body.selectionRevision !== undefined
        ? { selectionRevision: body.selectionRevision as string | null }
        : {}),
    };
  } catch {
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
  type Target = {
    date?: string;
    id: GoogleEventId;
    identity: "one-night" | "mapped";
    eventId?: string;
  };
  let stopCode: GoogleErrorCode | undefined;
  try {
    if (input.scope === "horizon") {
      await assertSelectionRevision(initial.connectionId, input.selectionRevision);
      // Persist removal intent BEFORE external writes, including when Google later fails.
      result.syncSelection = await removeSyncSelection(initial.connectionId, input.selected);
    }
    const targets: Target[] =
      input.scope === "horizon"
        ? syncDates(input.startDate, input.nights).flatMap((date) =>
            input.selected.map((id) => ({ date, id, identity: "mapped" as const })),
          )
        : input.events.flatMap((event) => [
            {
              id: event.id as GoogleEventId,
              identity: "one-night" as const,
              eventId: googleEventPayload(event).id,
            },
            ...(input.startDate
              ? [
                  {
                    date: input.startDate,
                    id: event.id as GoogleEventId,
                    identity: "mapped" as const,
                  },
                ]
              : []),
          ]);
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
            const eventId =
              target.identity === "mapped"
                ? await findEventMapping(session.connectionId, target.date!, target.id)
                : target.eventId!;
            if (stopCode) throw new GoogleCalendarError(stopCode);
            attemptedGoogle = Boolean(eventId);
            const status = eventId
              ? await removeGoogleEvent(eventId, target.id, session.accessToken, target.date)
              : "absent";
            // Never forget a failed or uncertain Google deletion. Retry checks absence first.
            if (eventId && target.identity === "mapped")
              await removeEventMapping(session.connectionId, target.date!, target.id, eventId);
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
