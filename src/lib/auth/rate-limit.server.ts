import { createHash } from "node:crypto";
import { database } from "@/lib/google-calendar/database.server";
export async function rateLimit(key: string, limit: number, seconds: number) {
  const hash = createHash("sha256").update(key).digest("hex");
  const rows =
    await database()`INSERT INTO miqaat_rate_limits(key_hash) VALUES(${hash}) ON CONFLICT(key_hash) DO UPDATE SET attempts=CASE WHEN miqaat_rate_limits.window_start<now()-(${seconds}*interval '1 second') THEN 1 ELSE miqaat_rate_limits.attempts+1 END,window_start=CASE WHEN miqaat_rate_limits.window_start<now()-(${seconds}*interval '1 second') THEN now() ELSE miqaat_rate_limits.window_start END RETURNING attempts`;
  return Number(rows[0]?.attempts) <= limit;
}
