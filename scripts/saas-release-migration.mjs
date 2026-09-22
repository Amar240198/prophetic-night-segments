import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const env = parseEnv(readFileSync(process.argv[2] ?? "/tmp/miqat-release-production.env", "utf8"));
if (!env.DATABASE_URL || env.DATABASE_URL.includes("[SENSITIVE]"))
  throw new Error("DATABASE_CREDENTIAL_UNAVAILABLE");
const sql = neon(env.DATABASE_URL);
const columns =
  await sql`SELECT table_name,column_name,column_default FROM information_schema.columns WHERE table_schema='public'`;
const has = (table, column) =>
  columns.some((r) => r.table_name === table && r.column_name === column);
const applied = {
  "008": has("google_connections", "management_enabled"),
  "009":
    columns.find((r) => r.table_name === "miqaat_preferences" && r.column_name === "prayer_source")
      ?.column_default === "'aladhan'::text",
  "010": has("miqaat_preferences", "prayer_configuration"),
  "011": has("miqaat_entitlements", "stripe_price_id"),
};
console.log(JSON.stringify({ migrations: applied }));
if (!process.argv.includes("--apply")) process.exit(0);
if (!applied["008"]) throw new Error("MIGRATION_008_REQUIRED");
if (process.env.RELEASE_VALIDATION_PASSED !== "true")
  throw new Error("RELEASE_VALIDATION_REQUIRED");
// Compare protected rows in-process; never print account or credential data.
const snapshot = async () => {
  const result = {};
  for (const table of [
    "google_connections",
    "calendar_preferences",
    "google_calendar_event_mappings",
    "miqaat_routines",
  ]) {
    const rows = await sql.query(`SELECT * FROM ${table} ORDER BY 1,2`);
    result[table] = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  }
  return result;
};
const before = await snapshot();
for (const [number, name] of [
  ["009", "remove_london_unified"],
  ["010", "product_consolidation"],
  ["011", "stripe_billing"],
]) {
  if (applied[number]) {
    console.log(`Migration ${number}: already present; skipped.`);
    continue;
  }
  const source = readFileSync(`migrations/${number}_${name}.sql`, "utf8");
  const statements = source
    .replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && !["BEGIN", "COMMIT"].includes(s));
  await sql.transaction(statements.map((s) => sql.query(s)));
  console.log(`Migration ${number}: committed.`);
}
const after = await snapshot();
if (JSON.stringify(before) !== JSON.stringify(after))
  throw new Error("PROTECTED_DATA_CHANGED_REVIEW_REQUIRED");
const legacy =
  await sql`SELECT count(*)::int AS unsafe FROM miqaat_automation WHERE configuration->'source'->>'kind'='london-unified' AND (enabled OR next_sync_at IS NOT NULL)`;
if (legacy[0].unsafe) throw new Error("LEGACY_AUTOMATION_NOT_PAUSED");
console.log(
  "Protected connection, selection, event-mapping and routine rows unchanged; legacy automation paused.",
);
