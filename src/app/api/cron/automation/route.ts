import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { database } from "@/lib/google-calendar/database.server";
import {
  readAccountGoogleSession,
  privateResponse,
  errorResponse,
} from "@/lib/google-calendar/session.server";
import { assertCalendarMutationsEnabled } from "@/lib/google-calendar/maintenance.server";
import { runAccountAutomation } from "@/lib/automation/run.server";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32)
    return privateResponse({ error: { code: "NOT_CONFIGURED" } }, 503);
  const expected = Buffer.from(`Bearer ${secret}`),
    supplied = Buffer.from(request.headers.get("authorization") ?? "");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied))
    return privateResponse({ error: { code: "FORBIDDEN" } }, 403);
  try {
    assertCalendarMutationsEnabled();
    // Fair ordering and a bounded batch. Leases protect duplicate invocations and manual sync.
    const accounts =
      await database()`SELECT a.user_id, c.id AS connection_id FROM miqaat_automation a
      JOIN miqaat_entitlements e ON e.user_id=a.user_id
      JOIN google_connections c ON c.id=a.google_connection_id AND c.user_id=a.user_id AND c.provider='google' AND c.disconnected_at IS NULL
      WHERE a.enabled AND (a.next_sync_at IS NULL OR a.next_sync_at<=now())
      AND ((e.status='trial' AND e.trial_ends_at>now()) OR (e.status IN ('active','trialing') AND e.plan<>'FREE' AND e.provider_subscription_id IS NOT NULL AND e.current_period_end>now()))
      ORDER BY a.next_sync_at NULLS FIRST, a.user_id LIMIT 3`;
    const results = await Promise.all(
      accounts.map(async (account) => {
        try {
          const session = await readAccountGoogleSession(account.user_id, account.connection_id);
          const result = await runAccountAutomation(
            account.user_id,
            session,
            new Date().toISOString(),
          );
          return { ok: !result.outcomes.some((o) => o.action === "BLOCKED") };
        } catch {
          await database()`UPDATE miqaat_automation SET last_attempted_at=now(),last_error_code='SYNC_FAILED',consecutive_failures=consecutive_failures+1,next_sync_at=now()+interval '1 hour' WHERE user_id=${account.user_id}`;
          return { ok: false };
        }
      }),
    );
    console.info(
      JSON.stringify({
        event: "scheduled_reconciliation",
        processed: results.length,
        failed: results.filter((r) => !r.ok).length,
      }),
    );
    return privateResponse({
      processed: results.length,
      failed: results.filter((r) => !r.ok).length,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
