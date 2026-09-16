import { createHash } from "node:crypto";
import type { CalendarEvent } from "@/lib/calendar/buildCalendarEvents";
import { GoogleCalendarError } from "./errors";
import { googleEventPayload, googleFailure } from "./events.server";
import {
  assertCalendarWriteAccess,
  confirmEventMapping,
  reserveEventMapping,
} from "./sync-database.server";
import type { GoogleSession } from "./session.server";
import { googleOwnershipAdapter, googleOwnershipMetadata } from "./ownership.server";

export { syncEventIdentity } from "./recovery.server";
import { recoverGoogleMapping } from "./recovery.server";
import { findOwnedEvent } from "@/lib/calendar/repository.server";

const endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
export async function syncGoogleEvent(
  session: GoogleSession,
  date: string,
  event: CalendarEvent,
): Promise<"created" | "updated" | "existing"> {
  if (event.serviceDate && event.serviceDate !== date)
    throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
  const persisted = await findOwnedEvent(session.connectionId, date, event.id);
  const recovered = persisted ? undefined : await recoverGoogleMapping(session, date, event.id);
  const mapping =
    persisted ??
    (await reserveEventMapping(session.connectionId, date, event.id, event.timeZone, recovered));
  if (
    mapping.provider !== "google" ||
    mapping.calendarId !== "primary" ||
    mapping.accountSubject !== session.subject ||
    mapping.connectionId !== session.connectionId
  )
    throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
  const id = mapping.providerEventId;
  const base = googleEventPayload(event);
  const hash = createHash("sha256")
    .update(JSON.stringify({ ...base, id }))
    .digest("hex");
  const payload = {
    ...base,
    id,
    extendedProperties: {
      private: { ...googleOwnershipMetadata(mapping), payloadHash: hash },
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
  if (existing.status === 404 && mapping.deletedAt)
    throw new GoogleCalendarError("EVENT_DELETED", 409);
  if (existing.status === 404) {
    await assertCalendarWriteAccess(session);
    const inserted = await call(`${endpoint}?sendUpdates=none`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (inserted.ok) {
      await confirmEventMapping(
        session.connectionId,
        date,
        event.id,
        hash,
        event,
        mapping.appEventId,
      );
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
  if (!googleOwnershipAdapter.verifyOwnership(body, mapping))
    throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  if (properties?.payloadHash === hash && mapping.metadataVersion === 1) status = "existing";
  else {
    if (typeof body.etag !== "string" || !body.etag)
      throw new GoogleCalendarError("EVENT_CHANGED", 409);
    // Patch only fields owned by the overlay; preserve unrelated calendar fields.
    const { id: _id, ...changes } = payload;
    void _id;
    await assertCalendarWriteAccess(session);
    const updated = await call(`${endpoint}/${id}?sendUpdates=none`, {
      method: "PATCH",
      headers: { "If-Match": body.etag },
      body: JSON.stringify(changes),
    });
    if (updated.status === 412) throw new GoogleCalendarError("EVENT_CHANGED", 409);
    if (!updated.ok) throw await googleFailure(updated);
    status = "updated";
  }
  await confirmEventMapping(session.connectionId, date, event.id, hash, event, mapping.appEventId);
  return status;
}
