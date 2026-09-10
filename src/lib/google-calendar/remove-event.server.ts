import { GoogleCalendarError } from "./errors";
import { googleFailure } from "./events.server";
import type { GoogleEventId } from "./plan";

/** Only called with an identity derived server-side or loaded from the account's mapping. */
export async function removeGoogleEvent(
  eventId: string,
  type: GoogleEventId,
  accessToken: string,
  localNight?: string,
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
  if ([404, 410].includes(existing.status)) return "absent";
  if (!existing.ok) throw await googleFailure(existing);
  const body = await existing.json();
  // Google tombstones can omit ownership metadata. No DELETE is needed for these.
  if (body.status === "cancelled") return "absent";
  const properties = body.extendedProperties?.private;
  if (
    body.id !== eventId ||
    properties?.application !== "prophetic-night-segments" ||
    properties?.planEvent !== type ||
    (localNight !== undefined
      ? properties?.localNight !== localNight
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
