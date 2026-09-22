import { NextRequest } from "next/server";
import { calendarContext, selections } from "@/lib/miqat/service.server";
import { database } from "@/lib/google-calendar/database.server";
import { readBoundedJson } from "@/lib/google-calendar/events.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import {
  assertSameOrigin,
  errorResponse,
  privateResponse,
} from "@/lib/google-calendar/session.server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const c = await calendarContext(request);
    const [calendars, selected] = await Promise.all([
      c.provider.listCalendars(),
      selections(c.session.connectionId),
    ]);
    const rows =
      await database()`SELECT management_enabled FROM google_connections WHERE id=${c.session.connectionId} AND user_id=${c.user.id}`;
    const destinations =
      await database()`SELECT calendar_id FROM calendar_preferences WHERE connection_id=${c.session.connectionId} AND provider='google' AND write_enabled=true ORDER BY updated_at DESC LIMIT 1`;
    return privateResponse({
      destination: destinations[0]?.calendar_id ?? "",
      calendars,
      selected,
      managementEnabled: rows[0]?.management_enabled === true,
      writesEnabled:
        process.env.CALENDAR_WRITES_ENABLED === "true" &&
        process.env.CALENDAR_MUTATIONS_PAUSED !== "true",
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const c = await calendarContext(request);
    const body = (await readBoundedJson(request)) as { selected?: unknown; destination?: unknown };
    if (
      !Array.isArray(body?.selected) ||
      body.selected.length > 10 ||
      body.selected.some((x) => typeof x !== "string" || x.length > 1024) ||
      new Set(body.selected).size !== body.selected.length
    )
      throw new GoogleCalendarError("INVALID_REQUEST");
    const calendars = await c.provider.listCalendars();
    if (body.selected.some((id) => !calendars.some((c) => c.id === id)))
      throw new GoogleCalendarError("FORBIDDEN", 403);
    if (
      body.destination !== undefined &&
      (typeof body.destination !== "string" ||
        (body.destination !== "" &&
          !calendars.some((c) => c.id === body.destination && c.isWritable)))
    )
      throw new GoogleCalendarError("FORBIDDEN", 403);
    const destination = typeof body.destination === "string" ? body.destination : null;
    await database()`INSERT INTO calendar_preferences (connection_id,provider,calendar_id,read_enabled,write_enabled)
    SELECT ${c.session.connectionId},'google',id,id=ANY(${body.selected as string[]}::text[]),id=${destination ?? ""} FROM (
      SELECT calendar_id AS id FROM calendar_preferences WHERE connection_id=${c.session.connectionId} AND provider='google'
      UNION SELECT unnest(${body.selected as string[]}::text[])
      UNION SELECT ${destination ?? ""} WHERE ${destination ?? ""}<>''
    ) AS desired
    ON CONFLICT (connection_id,provider,calendar_id) DO UPDATE SET read_enabled=EXCLUDED.read_enabled, write_enabled=CASE WHEN ${destination}::text IS NULL THEN calendar_preferences.write_enabled ELSE EXCLUDED.write_enabled END, updated_at=now()`;
    return privateResponse({ selected: body.selected });
  } catch (e) {
    return errorResponse(e);
  }
}
