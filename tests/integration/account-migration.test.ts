import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("applies the account migration after calendar ownership without changing existing rows", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "001_google_calendar_persistence",
      "002_google_calendar_event_mappings",
      "003_google_calendar_night_parts",
      "004_calendar_ownership",
      "005_miqaat_accounts",
    ])
      await db.exec(readFileSync(`migrations/${name}.sql`, "utf8"));
    const tables = (
      await db.query<{ relname: string }>(
        "SELECT relname FROM pg_class WHERE relname IN ('miqaat_users','miqaat_sessions','miqaat_preferences','miqaat_routines','miqaat_entitlements') ORDER BY relname",
      )
    ).rows.map((row) => row.relname);
    expect(tables).toEqual([
      "miqaat_entitlements",
      "miqaat_preferences",
      "miqaat_routines",
      "miqaat_sessions",
      "miqaat_users",
    ]);
    expect(
      (
        await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'google_connections' AND column_name = 'user_id'",
        )
      ).rows,
    ).toHaveLength(1);
  } finally {
    await db.close();
  }
}, 60_000);
