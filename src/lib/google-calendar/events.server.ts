import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { GoogleCalendarError, type GoogleErrorCode } from "./errors";
import { GOOGLE_EVENT_TITLES, type GoogleEventId } from "./plan";

export interface EventOutcome {
  id: string;
  status: "created" | "existing" | "failed";
  code?: GoogleErrorCode;
}

export function validateSelectedEvents(value: unknown): CalendarEvent[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("events" in value) ||
    !Array.isArray(value.events) ||
    value.events.length < 1 ||
    value.events.length > Object.keys(GOOGLE_EVENT_TITLES).length
  )
    throw new GoogleCalendarError("INVALID_REQUEST");
  const seen = new Set<string>();
  return value.events.map((event: unknown) => {
    if (!event || typeof event !== "object") throw new GoogleCalendarError("INVALID_REQUEST");
    const item = event as Partial<CalendarEvent>;
    if (
      typeof item.id !== "string" ||
      !Object.hasOwn(GOOGLE_EVENT_TITLES, item.id) ||
      seen.has(item.id) ||
      typeof item.start !== "string" ||
      item.start.length > 64 ||
      typeof item.end !== "string" ||
      item.end.length > 64 ||
      typeof item.timeZone !== "string" ||
      item.timeZone.length > 100 ||
      typeof item.description !== "string" ||
      item.description.length > 6000
    )
      throw new GoogleCalendarError("INVALID_REQUEST");
    seen.add(item.id);
    try {
      new Intl.DateTimeFormat("en", { timeZone: item.timeZone }).format(0);
      const start = Temporal.Instant.from(item.start);
      const end = Temporal.Instant.from(item.end);
      const duration = end.epochMilliseconds - start.epochMilliseconds;
      if (
        duration < 0 ||
        duration > 86_400_000 ||
        start.epochMilliseconds < 0 ||
        start.epochMilliseconds > 7_258_118_400_000
      )
        throw new Error();
      return {
        id: item.id,
        title: GOOGLE_EVENT_TITLES[item.id as GoogleEventId],
        start: start.toString(),
        end: end.toString(),
        timeZone: item.timeZone,
        description: item.description,
      };
    } catch {
      throw new GoogleCalendarError("INVALID_REQUEST");
    }
  });
}

export function googleEventPayload(event: CalendarEvent) {
  // Google requires a positive duration. Boundary markers occupy one minute; their start is exact.
  const end =
    Temporal.Instant.compare(event.start, event.end) === 0
      ? Temporal.Instant.from(event.start).add({ minutes: 1 }).toString()
      : event.end;
  const id = createHash("sha256")
    .update(
      JSON.stringify([
        "pns-google-v1",
        event.id,
        Temporal.Instant.from(event.start).toString(),
        Temporal.Instant.from(end).toString(),
      ]),
    )
    .digest("hex");
  return {
    id,
    summary: event.title,
    description: event.description
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;"),
    start: { dateTime: event.start, timeZone: event.timeZone },
    end: { dateTime: end, timeZone: event.timeZone },
    transparency: "transparent",
    visibility: "private",
    reminders: { useDefault: true },
    extendedProperties: {
      private: { application: "prophetic-night-segments", planEvent: event.id },
    },
  };
}

export async function googleFailure(response: Response): Promise<GoogleCalendarError> {
  if (response.status === 401) return new GoogleCalendarError("SESSION_EXPIRED", 401);
  if (response.status === 429) return new GoogleCalendarError("RATE_LIMITED", 429);
  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    const reasons = body?.error?.errors;
    if (
      Array.isArray(reasons) &&
      reasons.some((item) =>
        ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(item?.reason),
      )
    )
      return new GoogleCalendarError("RATE_LIMITED", 429);
    return new GoogleCalendarError("PERMISSION_DENIED", 403);
  }
  return new GoogleCalendarError("EVENT_FAILED", 502);
}

export async function insertGoogleEvent(
  event: CalendarEvent,
  accessToken: string,
): Promise<"created" | "existing"> {
  const payload = googleEventPayload(event);
  const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const headers = { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" };
  const response = await fetch(`${endpoint}?sendUpdates=none`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(6000),
  });
  if (response.ok) return "created";
  if (response.status === 409) {
    const existing = await fetch(`${endpoint}/${payload.id}?fields=status,extendedProperties`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!existing.ok) throw await googleFailure(existing);
    const body = await existing.json();
    if (body.status === "cancelled") throw new GoogleCalendarError("EVENT_DELETED", 409);
    if (body.extendedProperties?.private?.application === "prophetic-night-segments")
      return "existing";
    throw new GoogleCalendarError("EVENT_FAILED", 409);
  }
  throw await googleFailure(response);
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  if (
    !request.headers.get("content-type")?.toLowerCase().startsWith("application/json") ||
    !request.body
  )
    throw new GoogleCalendarError("INVALID_REQUEST");
  const reader = request.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 65_536) {
        await reader.cancel();
        throw new GoogleCalendarError("INVALID_REQUEST", 413);
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    throw error instanceof GoogleCalendarError ? error : new GoogleCalendarError("INVALID_REQUEST");
  } finally {
    reader.releaseLock();
  }
}
