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
  await db.query("INSERT INTO miqaat_users (id,email,password_hash) VALUES ($1,$2,$3)", [
    randomUUID(),
    "migration@example.invalid",
    "x".repeat(60),
  ]);
}, 60_000);

afterAll(() => db.close());

it("applies migration 006 transactionally and preserves account data", async () => {
  const before = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM miqaat_users",
  );
  await db.exec(readFileSync("migrations/006_miqaat_automation.sql", "utf8"));
  const after = await db.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM miqaat_users",
  );
  expect(after.rows[0]?.count).toBe(before.rows[0]?.count);

  const columns = await db.query<{ column_name: string }>(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'miqaat_automation'",
  );
  expect(columns.rows.map((row) => row.column_name)).toEqual(
    expect.arrayContaining([
      "user_id",
      "google_connection_id",
      "configuration",
      "revision",
      "next_sync_at",
    ]),
  );
  const indexes = await db.query<{ indexname: string }>(
    "SELECT indexname FROM pg_indexes WHERE tablename = 'miqaat_automation'",
  );
  expect(indexes.rows.map((row) => row.indexname)).toContain("miqaat_automation_due_idx");

  const invalid = await db
    .query("INSERT INTO miqaat_automation (user_id, configuration) VALUES ($1, '[]'::jsonb)", [
      randomUUID(),
    ])
    .catch((error: Error) => error);
  expect(invalid).toBeInstanceOf(Error);
});

it("pauses static timetable automation and preserves unrelated configuration", async () => {
  const user = await db.query<{ id: string }>("SELECT id FROM miqaat_users LIMIT 1");
  const id = user.rows[0]!.id;
  await db.query("INSERT INTO miqaat_preferences (user_id) VALUES ($1)", [id]);
  await db.query(
    "INSERT INTO miqaat_automation (user_id,enabled,configuration) VALUES ($1,true,$2::jsonb)",
    [
      id,
      JSON.stringify({
        source: { kind: "london-unified" },
        horizon: 60,
        modules: ["prayers"],
        onboardingComplete: true,
      }),
    ],
  );
  await db.exec(readFileSync("migrations/007_miqaat_password_resets.sql", "utf8"));
  await db.exec(readFileSync("migrations/008_calendar_intelligence.sql", "utf8"));
  await db.exec(readFileSync("migrations/009_remove_london_unified.sql", "utf8"));
  const result = await db.query(
    "SELECT enabled, configuration, last_error_code, revision FROM miqaat_automation WHERE user_id=$1",
    [id],
  );
  expect(result.rows[0]).toMatchObject({
    enabled: false,
    last_error_code: "PRAYER_SOURCE_REMOVED",
    configuration: {
      source: { kind: "london-unified" },
      horizon: 60,
      modules: ["prayers"],
      onboardingComplete: false,
    },
  });
  expect(
    (await db.query("SELECT prayer_source FROM miqaat_preferences WHERE user_id=$1", [id])).rows[0],
  ).toEqual({ prayer_source: "london-unified" });
});

it("applies the additive SaaS chain without silently confirming the removed prayer source", async () => {
  await db.exec(readFileSync("migrations/010_product_consolidation.sql", "utf8"));
  await db.exec(readFileSync("migrations/011_stripe_billing.sql", "utf8"));
  const row = (
    await db.query("SELECT prayer_configuration,onboarding_step FROM miqaat_preferences")
  ).rows[0];
  expect(row).toMatchObject({ prayer_configuration: {}, onboarding_step: "welcome" });
  expect((await db.query("SELECT configuration FROM miqaat_automation")).rows[0]).toMatchObject({
    configuration: { source: { kind: "london-unified" }, horizon: 60 },
  });
  expect((await db.query("SELECT stripe_event_id FROM miqaat_stripe_events")).rows).toHaveLength(0);
});
