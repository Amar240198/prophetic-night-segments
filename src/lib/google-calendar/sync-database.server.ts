import { database } from "./database.server";
import type { SyncPreference, SyncRequest } from "./sync";

export async function saveSyncPreference(connection: string, input: SyncRequest) {
  await database()`INSERT INTO google_calendar_sync_preferences
    (google_connection_id, sync_mode, horizon_days, requested_start_date, prayer_source, selected_event_types, planning_options)
    VALUES (${connection}, ${input.mode ?? "fixed"}, ${input.nights}, ${input.startDate}::date,
      ${JSON.stringify(input.source)}::jsonb, ${input.selected}, ${JSON.stringify(input.options)}::jsonb)
    ON CONFLICT (google_connection_id) DO UPDATE SET
      sync_mode = EXCLUDED.sync_mode, horizon_days = EXCLUDED.horizon_days,
      requested_start_date = EXCLUDED.requested_start_date, prayer_source = EXCLUDED.prayer_source,
      selected_event_types = EXCLUDED.selected_event_types, planning_options = EXCLUDED.planning_options,
      configuration_version = 1, updated_at = now()`;
}

export async function readSyncPreference(connection: string): Promise<SyncPreference | null> {
  const rows =
    await database()`SELECT sync_mode, horizon_days FROM google_calendar_sync_preferences WHERE google_connection_id = ${connection}`;
  return rows.length ? { mode: rows[0]!.sync_mode, horizonDays: rows[0]!.horizon_days } : null;
}

export async function acquireSyncLease(connection: string, owner: string): Promise<boolean> {
  const rows =
    await database()`INSERT INTO google_calendar_sync_leases (google_connection_id, owner, expires_at)
    VALUES (${connection}, ${owner}, now() + interval '5 minutes')
    ON CONFLICT (google_connection_id) DO UPDATE SET owner = EXCLUDED.owner, expires_at = EXCLUDED.expires_at
    WHERE google_calendar_sync_leases.expires_at <= now()
    RETURNING owner`;
  return rows.length === 1;
}
export async function releaseSyncLease(connection: string, owner: string) {
  await database()`DELETE FROM google_calendar_sync_leases WHERE google_connection_id = ${connection} AND owner = ${owner}`;
}
export async function reserveEventMapping(
  connection: string,
  date: string,
  type: string,
  eventId: string,
): Promise<string> {
  const rows = await database()`INSERT INTO google_calendar_event_mappings
    (google_connection_id, local_night, event_type, google_event_id)
    VALUES (${connection}, ${date}::date, ${type}, ${eventId})
    ON CONFLICT (google_connection_id, local_night, event_type) DO UPDATE
    SET google_event_id = google_calendar_event_mappings.google_event_id
    RETURNING google_event_id`;
  return rows[0]!.google_event_id as string;
}
export async function confirmEventMapping(
  connection: string,
  date: string,
  type: string,
  hash: string,
) {
  const rows =
    await database()`UPDATE google_calendar_event_mappings SET payload_hash = ${hash}, synced_at = now()
    WHERE google_connection_id = ${connection} AND local_night = ${date}::date AND event_type = ${type}
    RETURNING google_event_id`;
  if (rows.length !== 1) throw new Error("Mapping unavailable");
}
