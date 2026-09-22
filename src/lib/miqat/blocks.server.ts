import { timingSafeEqual, randomUUID } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { calendarMutation } from "@/lib/calendar/mutation.server";
import { database } from "@/lib/google-calendar/database.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { googleFailure } from "@/lib/google-calendar/events.server";
import {
  acquireSyncLease,
  releaseSyncLease,
  assertCalendarWriteAccess,
} from "@/lib/google-calendar/sync-database.server";
import { timeline, timelineInput, type calendarContext } from "./service.server";
import { assertCalendarMutationsEnabled } from "@/lib/google-calendar/maintenance.server";
import { blockProof, blockIdentity } from "./block-identity.server";
import type { Prayer, CalendarMutation } from "./model";
type Context = Awaited<ReturnType<typeof calendarContext>>;
interface BlockEvent {
  id: string;
  etag?: string;
  status?: string;
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties?: { private?: Record<string, string> };
}
async function existingBlock(
  c: Context,
  calendarId: string,
  id: string,
): Promise<BlockEvent | null> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${id}`,
    {
      headers: { Authorization: `Bearer ${c.session.accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) throw await googleFailure(response);
  const e = (await response.json()) as BlockEvent;
  if (
    e.id !== id ||
    e.extendedProperties?.private?.miqatProof !== blockProof(id) ||
    e.status === "cancelled"
  )
    throw new GoogleCalendarError("EVENT_NOT_OWNED", 409);
  return e;
}
export async function previewBlock(c: Context, input: unknown) {
  const v = input as {
    prayer?: Prayer;
    calendarId?: string;
    operation?: CalendarMutation["operation"];
  };
  const operation = v?.operation ?? "create";
  if (
    !v ||
    !["fajr", "dhuhr", "asr", "maghrib", "isha"].includes(v.prayer ?? "") ||
    typeof v.calendarId !== "string" ||
    !["create", "update", "delete"].includes(operation)
  )
    throw new GoogleCalendarError("INVALID_REQUEST");
  const request = timelineInput(input);
  const id = blockIdentity(
    c.user.id,
    c.session.connectionId,
    request.startDate,
    v.prayer!,
    v.calendarId,
  );
  const calendar = (await c.provider.listCalendars()).find(
    (x) => x.id === v.calendarId && x.isWritable,
  );
  if (!calendar) throw new GoogleCalendarError("PERMISSION_DENIED", 403);
  const existing = await existingBlock(c, calendar.id, id);
  if (operation !== "create" && !existing) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const day = await timeline(c, input, existing?.id);
  if (operation !== "delete" && day.preferences.protectionMode !== "CREATE_CALENDAR_BLOCK")
    throw new GoogleCalendarError("PERMISSION_DENIED", 403);
  const slot = day.analyses
    .find((a) => a.prayer === v.prayer)!
    .recommendedWindows.find((w) => Temporal.Instant.from(w.start).epochMilliseconds > Date.now());
  if (operation !== "delete" && !slot) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  if (existing && !existing.etag) throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const proposal = {
    id,
    operation,
    prayer: v.prayer!,
    date: day.date,
    calendarId: calendar.id,
    start: operation === "delete" ? existing!.start.dateTime : slot!.start,
    end: operation === "delete" ? existing!.end.dateTime : slot!.end,
    timezone: day.timezone,
    reasons:
      operation === "delete"
        ? ["Remove only this verified Miqāt-created prayer block."]
        : slot!.reasons,
    before: existing
      ? { start: existing.start.dateTime, end: existing.end.dateTime, etag: existing.etag }
      : null,
  };
  const data = Buffer.from(
    JSON.stringify({
      proposal,
      expiresAt: Date.now() + 300000,
      userId: c.user.id,
      connectionId: c.session.connectionId,
    }),
  ).toString("base64url");
  return {
    proposal,
    token: `${data}.${blockProof(data)}`,
    writesEnabled:
      process.env.CALENDAR_WRITES_ENABLED === "true" &&
      process.env.CALENDAR_MUTATIONS_PAUSED !== "true",
  };
}
export async function confirmBlock(c: Context, input: unknown) {
  assertCalendarMutationsEnabled();
  const v = input as { token?: string };
  if (typeof v?.token !== "string" || v.token.length > 12000)
    throw new GoogleCalendarError("INVALID_REQUEST");
  const [data, mac, ...extra] = v.token.split(".");
  if (
    !data ||
    !mac ||
    extra.length ||
    !/^[a-f0-9]{64}$/.test(mac) ||
    !timingSafeEqual(Buffer.from(mac), Buffer.from(blockProof(data)))
  )
    throw new GoogleCalendarError("FORBIDDEN", 403);
  const decoded = JSON.parse(Buffer.from(data, "base64url").toString());
  if (
    decoded.userId !== c.user.id ||
    decoded.connectionId !== c.session.connectionId ||
    decoded.expiresAt < Date.now()
  )
    throw new GoogleCalendarError("EVENT_CHANGED", 409);
  const p = decoded.proposal;
  const owner = randomUUID();
  if (!(await acquireSyncLease(c.session.connectionId, owner)))
    throw new GoogleCalendarError("SYNC_IN_PROGRESS", 409);
  const session = { ...c.session, operationOwner: owner };
  try {
    await assertCalendarWriteAccess(session);
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(p.calendarId)}/events`;
    const existing = await existingBlock(c, p.calendarId, p.id);
    const audits =
      await database()`SELECT operation FROM calendar_mutation_audit WHERE connection_id=${session.connectionId} AND external_event_id=${p.id} AND status='succeeded' ORDER BY created_at DESC LIMIT 1`;
    if (p.operation === "delete" && !existing && audits[0]?.operation === "DELETE")
      return { status: "removed", externalId: p.id };
    if (p.operation === "create" && !existing && audits[0]?.operation === "DELETE")
      throw new GoogleCalendarError("EVENT_DELETED", 409);
    if (
      existing &&
      p.operation !== "delete" &&
      Temporal.Instant.compare(existing.start.dateTime, p.start) === 0 &&
      Temporal.Instant.compare(existing.end.dateTime, p.end) === 0
    )
      return { status: "existing", externalId: p.id };
    if (p.operation === "create" && existing) throw new GoogleCalendarError("EVENT_CHANGED", 409);
    const refreshed = await previewBlock(c, input);
    if (JSON.stringify(refreshed.proposal) !== JSON.stringify(p))
      throw new GoogleCalendarError("EVENT_CHANGED", 409);
    const payload = {
      id: p.id,
      summary: `${p.prayer} — protected prayer time`,
      start: { dateTime: p.start, timeZone: p.timezone },
      end: { dateTime: p.end, timeZone: p.timezone },
      transparency: "opaque",
      visibility: "private",
      extendedProperties: {
        private: {
          createdBy: "miqat",
          type: "prayer_block",
          prayer: p.prayer,
          date: p.date,
          version: "1",
          appEventId: p.id,
          miqatProof: blockProof(p.id),
        },
      },
    };
    const method =
      p.operation === "delete" ? "DELETE" : p.operation === "update" ? "PATCH" : "POST";
    const response = await calendarMutation(
      session,
      `${endpoint}${method === "POST" ? "" : `/${p.id}`}?sendUpdates=none`,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(p.before ? { "If-Match": p.before.etag } : {}),
        },
        ...(method === "DELETE" ? {} : { body: JSON.stringify(payload) }),
      },
      existing,
    );
    if (response.status === 412) throw new GoogleCalendarError("EVENT_CHANGED", 409);
    if (!response.ok) throw await googleFailure(response);
    return {
      status: method === "DELETE" ? "removed" : method === "PATCH" ? "updated" : "created",
      externalId: p.id,
    };
  } finally {
    await releaseSyncLease(c.session.connectionId, owner).catch(() => undefined);
  }
}
