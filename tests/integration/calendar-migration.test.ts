import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("migrates legacy ownership without changing provider IDs, service dates or selections", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "001_google_calendar_persistence",
      "002_google_calendar_event_mappings",
      "003_google_calendar_night_parts",
    ])
      await db.exec(readFileSync(`migrations/${name}.sql`, "utf8"));
    await db.exec(`INSERT INTO google_connections VALUES
      ('00000000-0000-4000-8000-000000000001', 'legacy-subject', 'test@example.com', 'ciphertext', NULL, now() + interval '1 hour');
      INSERT INTO google_calendar_event_mappings (google_connection_id, local_night, event_type, google_event_id, synced_at)
      VALUES ('00000000-0000-4000-8000-000000000001', '2026-10-24', 'fajr', repeat('a', 64), now());
      INSERT INTO google_calendar_sync_preferences (google_connection_id, sync_mode, horizon_days, requested_start_date, prayer_source, selected_event_types, planning_options)
      VALUES ('00000000-0000-4000-8000-000000000001', 'continuous', 90, '2026-10-24', '{}', ARRAY['fajr'], '{}');
      INSERT INTO browser_sessions (id, google_connection_id, expires_at)
      VALUES (repeat('b', 64), '00000000-0000-4000-8000-000000000001', now() + interval '1 hour');`);
    const connections = (
      await db.query("SELECT id, google_subject, encrypted_access_token FROM google_connections")
    ).rows;
    const preferences = (await db.query("SELECT * FROM google_calendar_sync_preferences")).rows;
    const sessions = (await db.query("SELECT * FROM browser_sessions")).rows;
    await db.exec(readFileSync("migrations/004_calendar_ownership.sql", "utf8"));
    const migrated = (
      await db.query<{
        app_event_id: string;
        google_event_id: string;
        service_date: string;
        metadata_version: number;
      }>(
        "SELECT m.app_event_id, google_event_id, service_date::text, metadata_version FROM google_calendar_event_mappings m JOIN app_calendar_events e USING (app_event_id)",
      )
    ).rows[0]!;
    expect(migrated).toMatchObject({
      google_event_id: "a".repeat(64),
      service_date: "2026-10-24",
      metadata_version: 0,
    });
    expect(migrated.app_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(
      (
        await db.query(
          "SELECT sync_mode, selected_event_types FROM google_calendar_sync_preferences",
        )
      ).rows,
    ).toEqual([{ sync_mode: "continuous", selected_event_types: ["fajr"] }]);
    expect(
      (await db.query("SELECT id, google_subject, encrypted_access_token FROM google_connections"))
        .rows,
    ).toEqual(connections);
    expect((await db.query("SELECT * FROM google_calendar_sync_preferences")).rows).toEqual(
      preferences,
    );
    expect((await db.query("SELECT * FROM browser_sessions")).rows).toEqual(sessions);
    expect(
      (await db.query("SELECT service_timezone, start_at, end_at FROM app_calendar_events")).rows,
    ).toEqual([{ service_timezone: null, start_at: null, end_at: null }]);
    for (const statement of [
      "UPDATE app_calendar_events SET app_event_id = gen_random_uuid()",
      "UPDATE app_calendar_events SET connection_id = gen_random_uuid()",
      "UPDATE app_calendar_events SET event_kind = 'changed'",
      "UPDATE app_calendar_events SET owner_application = 'foreign'",
      "UPDATE app_calendar_events SET ownership_version = 2",
      "UPDATE google_connections SET id = gen_random_uuid()",
      "UPDATE google_connections SET provider = 'microsoft'",
      "UPDATE google_calendar_event_mappings SET app_event_id = gen_random_uuid()",
      "UPDATE google_calendar_event_mappings SET google_connection_id = gen_random_uuid()",
      "UPDATE google_calendar_event_mappings SET event_type = 'changed'",
      "UPDATE google_calendar_event_mappings SET calendar_id = 'another-calendar'",
      "UPDATE google_calendar_event_mappings SET google_event_id = repeat('c', 64)",
    ])
      await expect(db.exec(statement)).rejects.toThrow("immutable");
    await db.exec(
      "UPDATE app_calendar_events SET start_at = '2026-10-25T05:00:00Z', end_at = '2026-10-25T05:01:00Z'",
    );
    expect(
      (await db.query("SELECT start_at::text FROM app_calendar_events")).rows[0]!.start_at,
    ).toContain("2026-10-25 05:00:00");
    await expect(
      db.exec("UPDATE app_calendar_events SET service_date = '2026-10-25'"),
    ).rejects.toThrow("immutable");
    await expect(
      db.exec("UPDATE google_calendar_event_mappings SET local_night = '2026-10-25'"),
    ).rejects.toThrow("immutable");
    await expect(
      db.exec("UPDATE google_connections SET google_subject = 'another-account'"),
    ).rejects.toThrow("immutable");
    expect(
      (await db.query("SELECT app_event_id FROM app_calendar_events")).rows[0]!.app_event_id,
    ).toBe(migrated.app_event_id);
  } finally {
    await db.close();
  }
}, 60_000);
