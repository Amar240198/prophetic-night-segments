import { NextRequest } from "next/server";
import { completionRedirect, startOAuth } from "@/lib/google-calendar/oauth.server";
import { GoogleCalendarError } from "@/lib/google-calendar/errors";
import { assertCalendarMutationsEnabled } from "@/lib/google-calendar/maintenance.server";
import { errorResponse } from "@/lib/google-calendar/session.server";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    assertCalendarMutationsEnabled();
    return startOAuth();
  } catch (error) {
    if (error instanceof GoogleCalendarError && error.code === "CALENDAR_MAINTENANCE")
      return errorResponse(error);
    return completionRedirect(
      request,
      error instanceof GoogleCalendarError ? error.code : "CONNECTION_FAILED",
    );
  }
}
