import { NextRequest, NextResponse } from "next/server";
import { database } from "@/lib/google-calendar/database.server";
import { readAppUser } from "@/lib/auth/session.server";
export const runtime = "nodejs";
function responseError(status = 401) {
  return NextResponse.json(
    {
      error: {
        code: status === 401 ? "UNAUTHENTICATED" : "INVALID_PREFERENCES",
        message: status === 401 ? "Sign in is required." : "Preferences are invalid.",
      },
    },
    { status },
  );
}
export async function GET() {
  const user = await readAppUser();
  if (!user) return responseError();
  const rows =
    await database()`SELECT selected_prayers, default_sync_horizon, enabled_modules, prayer_source, location, fasting_settings, notification_settings FROM miqaat_preferences WHERE user_id = ${user.id}`;
  return NextResponse.json({ preferences: rows[0] ?? null });
}
export async function PUT(request: NextRequest) {
  const user = await readAppUser();
  if (!user) return responseError();
  const body = (await request.json()) as Record<string, unknown>;
  if (
    !Array.isArray(body.selectedPrayers) ||
    body.selectedPrayers.length > 5 ||
    body.selectedPrayers.some((value) => typeof value !== "string")
  )
    return responseError(400);
  const horizon = body.defaultSyncHorizon;
  if (![30, 60, 90, "continuous"].includes(horizon as never)) return responseError(400);
  const source =
    typeof body.prayerSource === "string" && body.prayerSource.length <= 100
      ? body.prayerSource
      : null;
  const location =
    typeof body.location === "string" && body.location.length <= 100 ? body.location : null;
  if (!source || !location) return responseError(400);
  await database()`UPDATE miqaat_preferences SET selected_prayers = ${JSON.stringify(body.selectedPrayers)}::jsonb, default_sync_horizon = ${String(horizon)}, enabled_modules = ${JSON.stringify(Array.isArray(body.enabledModules) ? body.enabledModules : [])}::jsonb, prayer_source = ${source}, location = ${location}, fasting_settings = ${JSON.stringify(body.fastingSettings ?? {})}::jsonb, notification_settings = ${JSON.stringify(body.notificationSettings ?? {})}::jsonb, updated_at = now() WHERE user_id = ${user.id}`;
  return GET();
}
