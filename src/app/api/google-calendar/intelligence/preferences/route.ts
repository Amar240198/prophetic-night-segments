import { NextRequest } from "next/server";
import { calendarContext, analysisPreferences } from "@/lib/miqat/service.server";
import { validateAnalysis } from "@/lib/miqat/analysis";
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
    return privateResponse(await analysisPreferences(c.user.id));
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const c = await calendarContext(request);
    const body = await readBoundedJson(request);
    let preferences;
    try {
      preferences = validateAnalysis(body);
    } catch {
      throw new GoogleCalendarError("INVALID_REQUEST");
    }
    await database()`UPDATE miqaat_preferences SET prayer_analysis=${JSON.stringify(preferences)}::jsonb,updated_at=now() WHERE user_id=${c.user.id}`;
    return privateResponse(preferences);
  } catch (e) {
    return errorResponse(e);
  }
}
