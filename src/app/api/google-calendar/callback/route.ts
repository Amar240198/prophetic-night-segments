import { finishOAuth } from "@/lib/google-calendar/oauth.server";
import { assertCalendarMutationsEnabled } from "@/lib/google-calendar/maintenance.server";
import { errorResponse } from "@/lib/google-calendar/session.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
export const runtime = "nodejs";
export async function GET(request: import("next/server").NextRequest) {
  try {
    assertCalendarMutationsEnabled();
    return finishOAuth(request);
  } catch (error) {
    return error instanceof GoogleCalendarError
      ? errorResponse(error)
      : errorResponse(new GoogleCalendarError("CONNECTION_FAILED", 502));
  }
}
