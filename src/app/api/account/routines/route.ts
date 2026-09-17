import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/google-calendar/database.server";
import { readAppUser } from "@/lib/auth/session.server";
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
  const rows =
    await database()`SELECT id, name, routine_type AS type, enabled, duration_minutes, recurrence, weekdays, timing_rule, calendar_sync_enabled, notification_enabled, created_at, updated_at FROM miqaat_routines WHERE user_id = ${user.id} ORDER BY created_at`;
  return NextResponse.json({ routines: rows });
}
export async function POST(request: NextRequest) {
  const user = await readAppUser();
  if (!user) return unauthenticated();
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const valid = validateRoutine({
      name: body.name as string,
      type: body.type as never,
      enabled: body.enabled as boolean | undefined,
      durationMinutes: body.durationMinutes as number,
      recurrence: body.recurrence as never,
      timing: body.timing as never,
    });
    const count =
      await database()`SELECT count(*)::int AS count FROM miqaat_routines WHERE user_id = ${user.id}`;
    if (Number(count[0]!.count) >= 5)
      return NextResponse.json(
        {
          error: { code: "ROUTINE_LIMIT", message: "The Free plan supports up to five routines." },
        },
        { status: 403 },
      );
    const rows =
      await database()`INSERT INTO miqaat_routines (user_id, name, routine_type, enabled, duration_minutes, recurrence, timing_rule) VALUES (${user.id}, ${valid.name}, ${valid.type}, ${valid.enabled}, ${valid.durationMinutes}, ${valid.recurrence}, ${JSON.stringify(valid.timing)}::jsonb) RETURNING id, name, routine_type AS type, enabled, duration_minutes, recurrence, timing_rule, created_at, updated_at`;
    return NextResponse.json({ routine: rows[0] }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine configuration is invalid." } },
      { status: 400 },
    );
  }
}
export async function DELETE(request: NextRequest) {
  const user = await readAppUser();
  if (!user) return unauthenticated();
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/.test(id))
    return NextResponse.json(
      { error: { code: "INVALID_ROUTINE", message: "Routine ID is invalid." } },
      { status: 400 },
    );
  await database()`DELETE FROM miqaat_routines WHERE id = ${id} AND user_id = ${user.id}`;
  return NextResponse.json({ ok: true });
}
