import { NextResponse } from "next/server";
import { readAppUser } from "@/lib/auth/session.server";
import { database } from "@/lib/google-calendar/database.server";
import { readSettings } from "@/lib/product/settings.server";
import { getEntitlements } from "@/lib/product/entitlements.server";
export async function GET() {
  const user = await readAppUser();
  if (!user)
    return NextResponse.json({ error: { message: "Sign in is required." } }, { status: 401 });
  const [settings, entitlements, routines] = await Promise.all([
    readSettings(user.id),
    getEntitlements(user.id),
    database()`SELECT id,name,routine_type,enabled,duration_minutes,recurrence,weekdays,timing_rule,calendar_sync_enabled,notification_enabled,notification_minutes,created_at,updated_at FROM miqaat_routines WHERE user_id=${user.id}`,
  ]);
  return NextResponse.json(
    { profile: { id: user.id, email: user.email }, settings, entitlements, routines },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
