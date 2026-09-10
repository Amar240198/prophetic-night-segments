import { createHash } from "node:crypto";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { GoogleCalendarError } from "./errors";
import { googleEventPayload, googleFailure } from "./events.server";
import { confirmEventMapping, reserveEventMapping } from "./sync-database.server";
import type { GoogleSession } from "./session.server";

export function syncEventIdentity(subject: string, date: string, type: string): string {
  // Stable across new browser sessions and reconnection; does not include mutable prayer times.
  return createHash("sha256")
    .update(JSON.stringify(["pns-overlay-v1", subject, date, type]))
    .digest("hex");
}
const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export async function syncGoogleEvent(
  session: GoogleSession,
  date: string,
  event: CalendarEvent,
): Promise<"created" | "updated" | "existing"> {
  const id = await reserveEventMapping(
    session.connectionId,
    date,
    event.id,
    syncEventIdentity(session.subject, date, event.id),
  );
  const base = googleEventPayload(event);
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...base, id }))
    .digest("hex");
  const payload = {
    ...base,
    id,
    extendedProperties: {
      private: { ...base.extendedProperties.private, localNight: date, payloadHash: hash },
    },
  };
  const headers = {
    Authorization: `Bearer ${session.accessToken}`,
    "Content-Type": "application/json",
  };
  const call = (url: string, options: RequestInit = {}) =>
    fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  let existing = await call(`${endpoint}/${id}`);
  let status: "created" | "updated" | "existing";
  if (existing.status === 404) {
    const inserted = await call(`${endpoint}?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (inserted.ok) {
      await confirmEventMapping(session.connectionId, date, event.id, hash);
      return "created";
    }
    if (inserted.status !== 409) throw await googleFailure(inserted);
    // Recover an insert that succeeded before an interrupted response or database write.
    existing = await call(`${endpoint}/${id}`);
  }
  if (existing.status === 410) throw new GoogleCalendarError("EVENT_DELETED", 409);
  if (!existing.ok) throw await googleFailure(existing);
  const body = await existing.json();
  if (body.status === "cancelled") throw new GoogleCalendarError("EVENT_DELETED", 409);
  const properties = body.extendedProperties?.private;
  if (
    properties?.application !== "prophetic-night-segments" ||
    properties?.planEvent !== event.id ||
    properties?.localNight !== date
  )
    throw new GoogleCalendarError("EVENT_FAILED", 409);
  if (properties.payloadHash === hash) status = "existing";
  else {
    if (typeof body.etag !== "string") throw new GoogleCalendarError("EVENT_FAILED", 409);
    // Patch only fields owned by the overlay; preserve unrelated calendar fields.
    const { id: _id, ...changes } = payload;
    void _id;
    const updated = await call(`${endpoint}/${id}?sendUpdates=none`, {
      method: "PATCH",
      headers: { "If-Match": body.etag },
      body: JSON.stringify(changes),
    });
    if (!updated.ok) throw await googleFailure(updated);
    status = "updated";
  }
  await confirmEventMapping(session.connectionId, date, event.id, hash);
  return status;
}
