import { createHash, randomUUID } from "node:crypto";
import type { GoogleSession } from "./session.server";
import { googleFailure } from "./events.server";
import { GoogleCalendarError } from "./errors";
import { CALENDAR_APPLICATION, type ExternalCalendarMapping } from "@/lib/calendar/ownership";
import { googleOwnershipAdapter, type GoogleOwnedEvent } from "./ownership.server";

/** Frozen legacy v1 format: never used to allocate a new event identity. */
export function syncEventIdentity(subject: string, date: string, type: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["pns-overlay-v1", subject, date, type]))
    .digest("hex");
}

/** Recovery candidates come from private service-date metadata, not nearby times. */
export async function recoverGoogleMapping(
  session: GoogleSession,
  date: string,
  type: string,
): Promise<ExternalCalendarMapping | undefined> {
  let pageToken: string | undefined;
  let recovered: ExternalCalendarMapping | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      privateExtendedProperty: `localNight=${date}`,
      maxResults: "250",
      showDeleted: "false",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      {
        headers: { Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!response.ok) throw await googleFailure(response);
    const body = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      (body.items !== undefined && !Array.isArray(body.items))
    )
      throw new GoogleCalendarError("EVENT_FAILED", 502);
    for (const candidate of (body.items ?? []) as GoogleOwnedEvent[]) {
      const p = candidate?.extendedProperties?.private;
      if (
        !p ||
        p.application !== CALENDAR_APPLICATION ||
        p.localNight !== date ||
        p.planEvent !== type ||
        candidate.status === "cancelled"
      )
        continue;
      if (typeof candidate.id !== "string" || !/^[0-9a-v]{5,1024}$/.test(candidate.id))
        throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
      const legacy = p.ownershipVersion === undefined;
      if (legacy && candidate.id !== syncEventIdentity(session.subject, date, type))
        throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
      if (
        !legacy &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(p.appEventId ?? "")
      )
        throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
      const mapping: ExternalCalendarMapping = {
        appEventId: legacy ? randomUUID() : p.appEventId!,
        ownerApplication: CALENDAR_APPLICATION,
        ownershipVersion: 1,
        connectionId: session.connectionId,
        provider: "google",
        accountSubject: session.subject,
        calendarId: "primary",
        providerEventId: candidate.id,
        serviceDate: date,
        eventKind: type,
        serviceTimeZone: null,
        metadataVersion: legacy ? 0 : 1,
        deletedAt: null,
      };
      if (!googleOwnershipAdapter.verifyOwnership(candidate, mapping))
        throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
      if (recovered && recovered.providerEventId !== mapping.providerEventId)
        throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
      recovered = mapping;
    }
    if (!body.nextPageToken) return recovered;
    if (typeof body.nextPageToken !== "string" || seen.has(body.nextPageToken))
      throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
    pageToken = body.nextPageToken;
    seen.add(pageToken!);
  }
  // Never mistake incomplete enumeration for the absence of an existing event.
  throw new GoogleCalendarError("SYNC_INCOMPLETE", 409);
}
