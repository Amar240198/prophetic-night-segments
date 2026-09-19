import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("applies password reset storage after Miqāt automation", async () => {
  const db = new PGlite();
  try {
    for (const name of [
      "001_google_calendar_persistence",
      "002_google_calendar_event_mappings",
      "003_google_calendar_night_parts",
      "004_calendar_ownership",
      "005_miqaat_accounts",
      "006_miqaat_automation",
    ]) {
      await db.exec(readFileSync(`migrations/${name}.sql`, "utf8"));
    }
    await db.exec(readFileSync("migrations/007_miqaat_password_resets.sql", "utf8"));
    const columns = (
      await db.query<{ column_name: string }>(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'miqaat_password_resets' ORDER BY ordinal_position",
      )
    ).rows.map((row) => row.column_name);
    expect(columns).toEqual(["token_hash", "user_id", "expires_at", "used_at", "created_at"]);
  } finally {
    await db.close();
  }
}, 60_000);
