import { NextRequest, NextResponse } from "next/server";
import { Temporal } from "@js-temporal/polyfill";
import { readAppUser } from "@/lib/auth/session.server";
import { readSettings } from "@/lib/product/settings.server";
import { cachedPrayerNight } from "@/lib/miqat/prayer-cache.server";
import { calculateNightSegments } from "@prophetic-night/night-engine";
import { resolveDailyPrayerInstants } from "@/lib/calendar/buildCalendarEvents";
import { fastingDates } from "@/lib/fasting/schedule";
export async function GET(request: NextRequest) {
  const user = await readAppUser();
  if (!user)
    return NextResponse.json({ error: { message: "Sign in is required." } }, { status: 401 });
  try {
    const settings = await readSettings(user.id);
    if (!settings.configured)
      return NextResponse.json(
        {
          error: {
            code: "PRAYER_SETTINGS_REQUIRED",
            message: "Confirm your prayer settings before loading prayer times.",
          },
        },
        { status: 409 },
      );
    const requested = request.nextUrl.searchParams.get("date");
    const date =
      requested ?? Temporal.Now.zonedDateTimeISO(settings.prayer.timezone).toPlainDate().toString();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error();
    const times = await cachedPrayerNight(settings.prayer.source, date);
    return NextResponse.json(
      {
        date,
        schedule: times.dailyPrayerSchedule
          ? resolveDailyPrayerInstants(times.dailyPrayerSchedule)
          : null,
        night: calculateNightSegments(times),
        source: settings.prayer.source,
        fasting: fastingDates(
          date,
          1,
          settings.automation.fasting,
          settings.automation.fastingAnchor,
        ),
        timezone: times.timeZone,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        error: {
          message:
            "Prayer times could not be loaded. Check prayer settings or try again. The free manual calculator remains available.",
        },
      },
      { status: 502 },
    );
  }
}
