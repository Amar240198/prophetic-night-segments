import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { neon } from "@neondatabase/serverless";
const env = parseEnv(
  readFileSync(process.argv[2] ?? "/tmp/miqat-intelligence-production.env", "utf8"),
);
if (!env.DATABASE_URL || env.DATABASE_URL.includes("[SENSITIVE]"))
  throw new Error("DATABASE_CREDENTIAL_UNAVAILABLE");
const sql = neon(env.DATABASE_URL);
const rows =
  await sql`SELECT table_name,column_name FROM information_schema.columns WHERE (table_name='google_connections' AND column_name IN ('granted_scopes','management_enabled')) OR (table_name='miqaat_password_resets' AND column_name='token_hash')`;
console.log(
  JSON.stringify(
    {
      migration007: rows.some((r) => r.table_name === "miqaat_password_resets"),
      migration008: rows.some((r) => r.column_name === "granted_scopes"),
      writesFlag: env.CALENDAR_WRITES_ENABLED ?? "absent (new code fails closed)",
      redirectConfigured: Boolean(env.GOOGLE_OAUTH_REDIRECT_URI),
      clientConfigured: Boolean(env.GOOGLE_CLIENT_ID),
    },
    null,
    2,
  ),
);
if (process.argv.includes("--apply")) {
  if (rows.some((r) => r.column_name === "granted_scopes"))
    throw new Error("MIGRATION_ALREADY_APPLIED");
  if (!rows.some((r) => r.table_name === "miqaat_password_resets"))
    throw new Error("MIGRATION_007_REQUIRED");
  const statements = readFileSync("migrations/008_calendar_intelligence.sql", "utf8")
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s && s !== "BEGIN" && s !== "COMMIT");
  await sql.transaction(statements.map((s) => sql.query(s)));
  console.log("Migration 008 applied transactionally.");
}
