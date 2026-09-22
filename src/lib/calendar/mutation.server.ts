import { database } from "@/lib/google-calendar/database.server";
import { assertCalendarWriteAccess } from "@/lib/google-calendar/sync-database.server";
import type { GoogleSession } from "@/lib/google-calendar/session.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
/** The only transport for remote calendar mutations. Callers must verify ownership and ETags. */
export async function calendarMutation(
  session: GoogleSession,
  url: string,
  options: RequestInit,
  before: unknown = null,
): Promise<Response> {
  await assertCalendarWriteAccess(session);
  const target = new URL(url);
  if (
    target.origin !== "https://www.googleapis.com" ||
    !/^\/calendar\/v3\/calendars\/[^/]+\/events(?:\/[^/]+)?$/.test(target.pathname) ||
    !["POST", "PATCH", "DELETE"].includes(options.method ?? "")
  )
    throw new GoogleCalendarError("FORBIDDEN", 403);
  // Persist intent before the remote side effect. No credentials or arbitrary event content are logged.
  const payload = typeof options.body === "string" ? JSON.parse(options.body) : null;
  const summary = (value: unknown) => {
    const v = value as { start?: unknown; end?: unknown; id?: string } | null;
    return v ? { id: v.id, start: v.start, end: v.end } : null;
  };
  const parts = target.pathname.split("/");
  const audit =
    await database()`INSERT INTO calendar_mutation_audit(connection_id,user_id,operation,calendar_id,external_event_id,entity_id,before_state,after_state,status)
 SELECT id,user_id,${options.method!},${decodeURIComponent(parts[4]!)},${parts[6] ?? payload?.id ?? null},${payload?.extendedProperties?.private?.appEventId ?? null},${JSON.stringify(summary(before))}::jsonb,${JSON.stringify(summary(payload))}::jsonb,'pending'
 FROM google_connections WHERE id=${session.connectionId} AND disconnected_at IS NULL RETURNING id`;
  if (audit.length !== 1) throw new GoogleCalendarError("SESSION_EXPIRED", 401);
  try {
    await assertCalendarWriteAccess(session);
    const response = await fetch(url, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    await database()`UPDATE calendar_mutation_audit SET status=${response.ok ? "succeeded" : "failed"},error_code=${response.ok ? null : `HTTP_${response.status}`} WHERE id=${audit[0]!.id}`;
    return response;
  } catch (error) {
    await database()`UPDATE calendar_mutation_audit SET status='unknown',error_code='MUTATION_INTERRUPTED' WHERE id=${audit[0]!.id}`.catch(
      () => undefined,
    );
    throw error;
  }
}
