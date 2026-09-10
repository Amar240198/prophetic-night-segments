import { GoogleCalendarError } from "./errors";
import { googleFailure } from "./events.server";
import type { GoogleEventId } from "./plan";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { Temporal } from "@js-temporal/polyfill";

/** Only called with an identity derived server-side or loaded from the account's mapping. */
export async function removeGoogleEvent(
  eventId: string,
  type: GoogleEventId,
  accessToken: string,
  ownership: { kind: "one-night" } | { kind: "mapped"; localNight: string },
  fallback?: { event: CalendarEvent },
): Promise<"removed" | "absent"> {
  if (!/^[0-9a-f]{64}$/.test(eventId)) throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`;
  const call = (url: string, method: "GET" | "DELETE", etag?: string) =>
    fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, ...(etag ? { "If-Match": etag } : {}) },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  const existing = await call(endpoint, "GET");
  if ([404, 410].includes(existing.status)) {
    if (ownership.kind === "one-night" && fallback) {
      return removeOneNightByIdentity(fallback.event, type, accessToken, call);
    }
    return "absent";
  }
  if (!existing.ok) throw await googleFailure(existing);
  const body = await existing.json();
  // Google tombstones can omit ownership metadata. No DELETE is needed for these.
  if (body.status === "cancelled") return "absent";
  const properties = body.extendedProperties?.private;
  if (
    body.id !== eventId ||
    properties?.application !== "prophetic-night-segments" ||
    properties?.planEvent !== type ||
    (ownership.kind === "mapped"
      ? properties?.localNight !== ownership.localNight
      : properties?.localNight !== undefined)
  )
    throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  if (typeof body.etag !== "string" || !body.etag)
    throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const deleted = await call(`${endpoint}?sendUpdates=none`, "DELETE", body.etag);
  if (deleted.ok) return "removed";
  if ([404, 410].includes(deleted.status)) return "absent";
  if (deleted.status === 412) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  throw await googleFailure(deleted);
}

async function removeOneNightByIdentity(
  event: CalendarEvent,
  type: GoogleEventId,
  accessToken: string,
  call: (url: string, method: "GET" | "DELETE", etag?: string) => Promise<Response>,
): Promise<"removed" | "absent"> {
  const expectedStart = Temporal.Instant.from(event.start);
  const timeMin = expectedStart.subtract({ hours: 24 }).toString();
  const timeMax = expectedStart.add({ hours: 24 }).toString();
  const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const params = new URLSearchParams({
    singleEvents: "true",
    showDeleted: "false",
    timeMin,
    timeMax,
  });
  params.append("privateExtendedProperty", "application=prophetic-night-segments");
  params.append("privateExtendedProperty", `planEvent=${type}`);
  const listed = await call(`${endpoint}?${params.toString()}`, "GET");
  if ([404, 410].includes(listed.status)) return "absent";
  if (!listed.ok) throw await googleFailure(listed);
  const body = await listed.json();
  const candidates = (Array.isArray(body.items) ? body.items : []).filter((item: unknown) => {
    if (!item || typeof item !== "object") return false;
    const value = item as {
      id?: unknown;
      status?: unknown;
      extendedProperties?: { private?: Record<string, unknown> };
    };
    const properties = value.extendedProperties?.private;
    return (
      typeof value.id === "string" &&
      /^[0-9a-f]{64}$/.test(value.id) &&
      properties?.application === "prophetic-night-segments" &&
      properties.planEvent === type &&
      properties.localNight === undefined &&
      value.status !== "cancelled"
    );
  }) as Array<{
    id: string;
    etag?: unknown;
  }>;
  if (candidates.length === 0) return "absent";
  if (candidates.length !== 1) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const candidate = candidates[0]!;
  if (typeof candidate.etag !== "string" || !candidate.etag)
    throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const deleted = await call(
    `${endpoint}/${candidate.id}?sendUpdates=none`,
    "DELETE",
    candidate.etag,
  );
  if (deleted.ok) return "removed";
  if ([404, 410].includes(deleted.status)) return "absent";
  if (deleted.status === 412) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  throw await googleFailure(deleted);
}
