import { GoogleCalendarError } from "./errors";
import { googleFailure } from "./events.server";
import { googleOwnershipAdapter } from "./ownership.server";
import type { ExternalCalendarMapping } from "@/lib/calendar/ownership";
import type { GoogleSession } from "./session.server";
import { assertCalendarWriteAccess } from "./sync-database.server";

/** Only exact, persisted and scope-verified identities reach this adapter. */
export async function removeGoogleEvent(
  mapping: ExternalCalendarMapping,
  session: GoogleSession,
): Promise<"removed" | "absent"> {
  if (
    mapping.provider !== "google" ||
    mapping.connectionId !== session.connectionId ||
    mapping.accountSubject !== session.subject ||
    mapping.calendarId !== "primary"
  )
    throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.calendarId)}/events/${encodeURIComponent(mapping.providerEventId)}`;
  const call = (method: "GET" | "DELETE", etag?: string) =>
    fetch(`${endpoint}${method === "DELETE" ? "?sendUpdates=none" : ""}`, {
      method,
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        ...(etag ? { "If-Match": etag } : {}),
      },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
  const existing = await call("GET");
  if ([404, 410].includes(existing.status)) return "absent";
  if (!existing.ok) throw await googleFailure(existing);
  const body = await existing.json();
  if (body.status === "cancelled") return "absent";
  if (!googleOwnershipAdapter.verifyOwnership(body, mapping))
    throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  if (typeof body.etag !== "string" || !body.etag)
    throw new GoogleCalendarError("EVENT_CHANGED", 409);
  await assertCalendarWriteAccess(session);
  const deleted = await call("DELETE", body.etag);
  if (deleted.ok) return "removed";
  if ([404, 410].includes(deleted.status)) return "absent";
  if (deleted.status === 412) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  throw await googleFailure(deleted);
}
