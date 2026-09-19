import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";

const db = new PGlite();

beforeAll(async () => {
  for (const name of [
    "001_google_calendar_persistence",
    "002_google_calendar_event_mappings",
    "003_google_calendar_night_parts",
    "004_calendar_ownership",
    "005_miqaat_accounts",
  ])
    await db.exec(readFileSync(`migrations/${name}.sql`, "utf8"));
  await db.query(
    "INSERT INTO miqaat_users (id,email,password_hash) VALUES ($1,$2,$3)",
    [randomUUID(), "migration@example.invalid", "x".repeat(60)],
  );
}, 60_000);

afterAll(() => db.close());

it("applies migration 006 transactionally and preserves account data", async () => {
  const before = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM miqaat_users");
  await db.exec(readFileSync("migrations/006_miqaat_automation.sql", "utf8"));
  const after = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM miqaat_users");
  expect(after.rows[0]?.count).toBe(before.rows[0]?.count);

  const columns = await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'miqaat_automation'",
  );
  expect(columns.rows.map((row) => row.column_name)).toEqual(
    expect.arrayContaining(["user_id", "google_connection_id", "configuration", "revision", "next_sync_at"]),
  );
  const indexes = await db.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'miqaat_automation'",
  );
  expect(indexes.rows.map((row) => row.indexname)).toContain("miqaat_automation_due_idx");

  const invalid = await db.query(
    "INSERT INTO miqaat_automation (user_id, configuration) VALUES ($1, '[]'::jsonb)",
    [randomUUID()],
  ).catch((error: Error) => error);
  expect(invalid).toBeInstanceOf(Error);
});
