import { getEntitlements } from "@/lib/product/entitlements.server";
import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/google-calendar/database.server";
import { assertSameOrigin, readAppUser } from "@/lib/auth/session.server";
import { validateRoutine } from "@/lib/routines/model";
export const runtime = "nodejs";
function unauthenticated() {
  return NextResponse.json(
    { error: { code: "UNAUTHENTICATED", message: "Sign in is required." } },
    { status: 401 },
  );
}
export async function GET() {
  const user = await readAppUser();
  if (!user) return unauthenticated();
  if (!(await getEntitlements(user.id)).features["advanced-routines"])
    return NextResponse.json(
      {
        error: { code: "PRO_REQUIRED", message: "Advanced routines are available with Miqāt Pro." },
      },
      { status: 403 },
    );
  const rows =
    await database()`SELECT id, name, routine_type AS type, enabled, duration_minutes, recurrence, weekdays, timing_rule, calendar_sync_enabled, notification_enabled, notification_minutes, created_at, updated_at FROM miqaat_routines WHERE user_id = ${user.id} ORDER BY created_at`;
  return NextResponse.json({ routines: rows });
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Request origin is not allowed." } },
      { status: 403 },
    );
  }
  const user = await readAppUser();
  if (!user) return unauthenticated();
  if (!(await getEntitlements(user.id)).features["advanced-routines"])
    return NextResponse.json(
      {
        error: { code: "PRO_REQUIRED", message: "Advanced routines are available with Miqāt Pro." },
      },
      { status: 403 },
    );
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const valid = validateRoutine({
      name: body.name as string,
      type: body.type as never,
      enabled: body.enabled as boolean | undefined,
      durationMinutes: body.durationMinutes as number,
      recurrence: body.recurrence as never,
      timing: body.timing as never,
      weekdays: body.weekdays as number[],
      calendarSyncEnabled: body.calendarSyncEnabled as boolean,
      notificationMinutes: body.notificationMinutes as number | null,
    });
    const count =
      await database()`SELECT count(*)::int AS count FROM miqaat_routines WHERE user_id = ${user.id}`;
    if (Number(count[0]!.count) >= 100)
      return NextResponse.json(
        {
          error: { code: "ROUTINE_LIMIT", message: "You can save up to 100 routines." },
        },
        { status: 403 },
      );
    const rows =
      await database()`INSERT INTO miqaat_routines (user_id, name, routine_type, enabled, duration_minutes, recurrence, timing_rule, weekdays, calendar_sync_enabled, notification_minutes) VALUES (${user.id}, ${valid.name}, ${valid.type}, ${valid.enabled}, ${valid.durationMinutes}, ${valid.recurrence}, ${JSON.stringify(valid.timing)}::jsonb, ${JSON.stringify(valid.weekdays)}::jsonb, ${valid.calendarSyncEnabled}, ${valid.notificationMinutes}) RETURNING id, name, routine_type AS type, enabled, duration_minutes, recurrence, timing_rule, created_at, updated_at`;
    return NextResponse.json({ routine: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine configuration is invalid." } },
      { status: 400 },
    );
  }
}
export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Request origin is not allowed." } },
      { status: 403 },
    );
  }
  const user = await readAppUser();
  if (!user) return unauthenticated();
  if (!(await getEntitlements(user.id)).features["advanced-routines"])
    return NextResponse.json(
      {
        error: { code: "PRO_REQUIRED", message: "Advanced routines are available with Miqāt Pro." },
      },
      { status: 403 },
    );
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine ID is invalid." } },
      { status: 400 },
    );
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const valid = validateRoutine({
      name: body.name as string,
      type: body.type as never,
      enabled: body.enabled as boolean | undefined,
      durationMinutes: body.durationMinutes as number,
      recurrence: body.recurrence as never,
      timing: body.timing as never,
      weekdays: body.weekdays as number[],
      calendarSyncEnabled: body.calendarSyncEnabled as boolean,
      notificationMinutes: body.notificationMinutes as number | null,
    });
    const rows =
      await database()`UPDATE miqaat_routines SET name = ${valid.name}, routine_type = ${valid.type}, enabled = ${valid.enabled}, duration_minutes = ${valid.durationMinutes}, recurrence = ${valid.recurrence}, timing_rule = ${JSON.stringify(valid.timing)}::jsonb, weekdays = ${JSON.stringify(valid.weekdays)}::jsonb, calendar_sync_enabled = ${valid.calendarSyncEnabled}, notification_minutes = ${valid.notificationMinutes}, updated_at = now() WHERE id = ${id} AND user_id = ${user.id} RETURNING id, name, routine_type AS type, enabled, duration_minutes, recurrence, timing_rule, created_at, updated_at`;
    if (!rows.length)
      return NextResponse.json(
        { error: { code: "ROUTINE_NOT_FOUND", message: "Routine was not found." } },
        { status: 404 },
      );
    return NextResponse.json({ routine: rows[0] });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine configuration is invalid." } },
      { status: 400 },
    );
  }
}
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Request origin is not allowed." } },
      { status: 403 },
    );
  }
  const user = await readAppUser();
  if (!user) return unauthenticated();
  if (!(await getEntitlements(user.id)).features["advanced-routines"])
    return NextResponse.json(
      {
        error: { code: "PRO_REQUIRED", message: "Advanced routines are available with Miqāt Pro." },
      },
      { status: 403 },
    );
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine ID is invalid." } },
      { status: 400 },
    );
  await database()`DELETE FROM miqaat_routines WHERE id = ${id} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
