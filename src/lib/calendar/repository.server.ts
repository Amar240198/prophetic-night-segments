import { randomBytes, randomUUID } from "node:crypto";
import { database } from "@/lib/google-calendar/database.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import {
  CALENDAR_APPLICATION,
  OWNERSHIP_VERSION,
  isServiceDate,
  type ExternalCalendarMapping,
} from "./ownership";

/** Single persistent ledger shared by all managed creation paths. */
export async function findOwnedEvent(
  connection: string,
  date: string,
  type: string,
  calendar = "primary",
): Promise<ExternalCalendarMapping | null> {
  const rows =
    await database()`SELECT m.app_event_id, m.google_connection_id AS connection_id, m.calendar_id,
    m.google_event_id AS provider_event_id, m.local_night::text, m.event_type, m.metadata_version,
    m.deleted_at::text, e.service_timezone, c.provider, c.google_subject AS provider_subject
    FROM google_calendar_event_mappings m JOIN app_calendar_events e USING (app_event_id)
    JOIN google_connections c ON c.id = m.google_connection_id
    WHERE m.google_connection_id = ${connection} AND m.calendar_id = ${calendar}
      AND m.local_night = ${date}::date AND m.event_type = ${type}`;
  if (!rows.length) return null;
  const r = rows[0]!;
  return {
    appEventId: r.app_event_id,
    ownerApplication: CALENDAR_APPLICATION,
    ownershipVersion: OWNERSHIP_VERSION,
    connectionId: r.connection_id,
    serviceDate: r.local_night,
    eventKind: r.event_type,
    serviceTimeZone: r.service_timezone,
    provider: r.provider,
    accountSubject: r.provider_subject,
    calendarId: r.calendar_id,
    providerEventId: r.provider_event_id,
    metadataVersion: r.metadata_version,
    deletedAt: r.deleted_at,
  };
}

export async function reserveOwnedEvent(
  connection: string,
  date: string,
  type: string,
  timeZone: string | null,
  recovered?: ExternalCalendarMapping,
): Promise<ExternalCalendarMapping> {
  if (!isServiceDate(date)) throw new GoogleCalendarError("SERVICE_DATE_REQUIRED");
  if (
    recovered &&
    (recovered.connectionId !== connection ||
      recovered.serviceDate !== date ||
      recovered.eventKind !== type)
  )
    throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
  const appId = recovered?.appEventId ?? randomUUID();
  // Google-valid random ID, allocated once and committed before the external write.
  const providerId = recovered?.providerEventId ?? randomBytes(32).toString("hex");
  await database()`WITH created AS (
    INSERT INTO app_calendar_events (app_event_id, connection_id, service_date, event_kind, service_timezone)
    SELECT ${appId}, id, ${date}::date, ${type}, ${recovered ? recovered.serviceTimeZone : timeZone} FROM google_connections
    WHERE id = ${connection} AND provider = 'google' AND disconnected_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM google_calendar_event_mappings
        WHERE google_connection_id = ${connection} AND calendar_id = 'primary'
          AND local_night = ${date}::date AND event_type = ${type})
    ON CONFLICT (app_event_id) DO NOTHING
    RETURNING app_event_id
  ), identities AS (
    SELECT app_event_id FROM created UNION
    SELECT app_event_id FROM app_calendar_events WHERE app_event_id = ${appId}
      AND connection_id = ${connection} AND service_date = ${date}::date AND event_kind = ${type}
  ) INSERT INTO google_calendar_event_mappings
    (app_event_id, google_connection_id, local_night, event_type, google_event_id, metadata_version)
    SELECT app_event_id, ${connection}, ${date}::date, ${type}, ${providerId}, ${recovered?.metadataVersion ?? 1} FROM identities
    ON CONFLICT (google_connection_id, calendar_id, local_night, event_type) DO NOTHING`;
  const mapping = await findOwnedEvent(connection, date, type);
  if (!mapping || mapping.provider !== "google")
    throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
  return mapping;
}

export async function confirmOwnedEvent(
  connection: string,
  date: string,
  type: string,
  hash: string,
  event?: { start: string; end: string },
  appEventId?: string,
) {
  const rows = await database()`WITH confirmed AS (
    UPDATE google_calendar_event_mappings SET payload_hash = ${hash}, synced_at = now(),
      metadata_version = 1, deleted_at = NULL
    WHERE google_connection_id = ${connection} AND calendar_id = 'primary'
      AND local_night = ${date}::date AND event_type = ${type}
      AND (${appEventId ?? null}::uuid IS NULL OR app_event_id = ${appEventId ?? null}::uuid)
    RETURNING app_event_id
  ), content AS (
    UPDATE app_calendar_events SET start_at = COALESCE(${event?.start ?? null}::timestamptz, start_at),
      end_at = COALESCE(${event?.end ?? null}::timestamptz, end_at)
    WHERE app_event_id IN (SELECT app_event_id FROM confirmed)
  ) SELECT app_event_id FROM confirmed`;
  if (rows.length !== 1) throw new GoogleCalendarError("IDENTITY_CONFLICT", 409);
}
